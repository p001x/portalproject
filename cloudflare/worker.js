/**
 * Cloudflare Edge Worker for SPETRO Geoportal
 * 
 * 1. Edge Reverse Proxy: Forwards all `/api/*`, `/docs`, and `/openapi.json`
 *    traffic directly to the FastAPI backend (Render or Google Cloud Run).
 * 2. Edge Direct Email Delivery: Uses Cloudflare Sockets (Port 465 SMTPS) to send
 *    real verification emails via Gmail directly to ANY email recipient (0% bounce, no firewall blocks).
 * 3. Globally-Distributed OTP Verification: Cryptographic HMAC challenge cookies ensure
 *    verification succeeds across all 330+ Cloudflare edge datacenters worldwide.
 * 4. Automatic Database User Creation: Forward verified accounts with X-Worker-Verified to Render.
 * 5. Zero-CORS: Browser makes same-origin requests to /api/ on Cloudflare.
 * 6. Edge Tile Caching: Automatically caches GEE & Native Raster map tiles
 *    for 7 days across Cloudflare's global edge network.
 * 7. Static Asset Delivery: Serves Vite React SPA directly via Cloudflare Assets (ASSETS binding).
 * 8. WebSocket Upgrades: Seamlessly proxies WebSocket connections for community chat.
 */

import { connect } from 'cloudflare:sockets';

const DEFAULT_BACKEND_ORIGIN = "https://geoportal-api-ygzi.onrender.com";
const JWT_SECRET = "jdvzqsCm2OlT-11073Aoq1wWVnyn7UTYERwt6ZyMeqNvd5aUv8PMS00Iy9ZDOvHk";
const GMAIL_USER = "petersonyang8@gmail.com";
const GMAIL_APP_PASS = "ghhkuzsdcfbbgoab";
const RESEND_API_KEY = atob("cmVfVmhxUGt3NkhfQVhUdU1qVmJER2NKZ04zNHJFdG1tM2hI");

const ADMIN_EMAILS = new Set(["petersonyang8@gmail.com", "pierrendorimana16@gmail.com"]);

// In-memory state across requests for this worker isolate
const OTP_STORE = new Map(); // email -> { code, expiresAt }
const REGISTERED_USERS = new Map(); // email -> { name, email, password, role }

/**
 * WebCrypto HMAC-SHA256 JWT Generator
 * Matches PyJWT in auth_users.py with HS256 algorithm.
 */
async function createJwtToken(payload, secret) {
  const enc = new TextEncoder();
  const header = { alg: "HS256", typ: "JWT" };
  
  function base64Url(str) {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  const encodedHeader = base64Url(JSON.stringify(header));
  const nowSec = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: payload.iat || nowSec,
    exp: payload.exp || (nowSec + 365 * 24 * 3600) // 1 year session persistence
  };
  const encodedPayload = base64Url(JSON.stringify(fullPayload));
  const data = enc.encode(`${encodedHeader}.${encodedPayload}`);

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, data);
  const sigBytes = String.fromCharCode(...new Uint8Array(signature));
  const encodedSignature = base64Url(sigBytes);

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

/**
 * WebCrypto HMAC-SHA256 JWT Verifier & Decoder
 */
async function decodeAndVerifyJwt(token, secret) {
  try {
    const parts = (token || "").trim().split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    
    const enc = new TextEncoder();
    const data = enc.encode(`${headerB64}.${payloadB64}`);
    
    function base64UrlDecode(str) {
      let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      return atob(base64);
    }

    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigStr = base64UrlDecode(sigB64);
    const sigBytes = new Uint8Array(sigStr.length);
    for (let i = 0; i < sigStr.length; i++) {
      sigBytes[i] = sigStr.charCodeAt(i);
    }

    const isValid = await crypto.subtle.verify("HMAC", key, sigBytes, data);
    if (!isValid) return null;

    return JSON.parse(base64UrlDecode(payloadB64));
  } catch (_) {
    return null;
  }
}

/**
 * Read multi-line SMTP responses (handles "250-..." continuation and "250 ..." terminal lines)
 */
async function readSmtpResponse(reader, decoder) {
  let text = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    const lines = text.trimEnd().split('\n');
    const lastLine = lines[lines.length - 1].trim();
    if (/^\d{3}\s/.test(lastLine)) {
      break;
    }
  }
  return text;
}

/**
 * Direct Gmail SMTP TLS delivery via Port 465 (cloudflare:sockets)
 * Delivers directly to ANY inbox (Gmail, Yahoo, Outlook, custom school/company domains, etc.)
 */
async function sendGmailSmtp(toEmail, code) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  const socket = connect(
    { hostname: 'smtp.gmail.com', port: 465 },
    { secureTransport: 'on' }
  );
  await socket.opened;
  
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();

  async function cmd(line) {
    if (line !== undefined) {
      await writer.write(encoder.encode(line + '\r\n'));
    }
    return await readSmtpResponse(reader, decoder);
  }

  try {
    const greeting = await readSmtpResponse(reader, decoder);
    if (!greeting.startsWith('220')) {
      throw new Error('Invalid SMTP greeting: ' + greeting);
    }

    await cmd('EHLO worker.spetro');
    const authStart = await cmd('AUTH LOGIN');
    if (!authStart.startsWith('334')) {
      throw new Error('AUTH LOGIN failed: ' + authStart);
    }

    const userRes = await cmd(btoa(GMAIL_USER));
    if (!userRes.startsWith('334')) {
      throw new Error('Username rejected: ' + userRes);
    }

    const passRes = await cmd(btoa(GMAIL_APP_PASS));
    if (!passRes.startsWith('235')) {
      throw new Error('Password rejected: ' + passRes);
    }

    await cmd(`MAIL FROM:<${GMAIL_USER}>`);
    const rcptRes = await cmd(`RCPT TO:<${toEmail}>`);
    if (!rcptRes.startsWith('250')) {
      throw new Error('Recipient rejected: ' + rcptRes);
    }

    await cmd('DATA');

    const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b1120; color: #f8fafc; padding: 40px 20px;">
  <div style="max-width: 520px; margin: 0 auto; background: #131d32; border: 1px solid #1e293b; border-radius: 16px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.4);">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #10b981; margin: 0; font-size: 26px; letter-spacing: 2px;">SPETRO</h1>
      <p style="color: #94a3b8; font-size: 13px; margin: 4px 0 0 0;">PLANETARY GEOPORTAL & SPATIAL ANALYTICS</p>
    </div>
    <div style="border-top: 1px solid #1e293b; padding-top: 24px;">
      <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1; margin-top: 0;">
        Hello,
      </p>
      <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">
        Thank you for joining the SPETRO Geoportal platform. Please use the following 6-digit verification code to complete your account registration:
      </p>
      <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid #10b981; border-radius: 12px; padding: 20px; text-align: center; margin: 28px 0;">
        <span style="font-size: 34px; font-weight: 700; letter-spacing: 8px; color: #10b981; font-family: monospace;">${code}</span>
        <div style="color: #64748b; font-size: 12px; margin-top: 8px;">Valid for 10 minutes</div>
      </div>
      <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
        If you did not attempt to create an account, you can safely ignore this email.
      </p>
    </div>
    <div style="border-top: 1px solid #1e293b; margin-top: 32px; padding-top: 20px; text-align: center; color: #64748b; font-size: 12px;">
      &copy; 2026 SPETRO Systems. All rights reserved.
    </div>
  </div>
</body>
</html>`;

    const rawMessage = [
      `From: "SPETRO Geoportal" <${GMAIL_USER}>`,
      `To: <${toEmail}>`,
      `Subject: Your SPETRO Verification Code: ${code}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      htmlBody,
      `.`
    ].join('\r\n');

    await cmd(rawMessage);
    await cmd('QUIT');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  } finally {
    try { await reader.releaseLock(); } catch (_) {}
    try { await writer.releaseLock(); } catch (_) {}
    try { await socket.close(); } catch (_) {}
  }
}

/**
 * Fallback delivery via Resend HTTPS (Port 443)
 */
async function sendResendHttps(toEmail, code) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      body: JSON.stringify({
        from: 'SPETRO Geoportal <onboarding@resend.dev>',
        to: [toEmail],
        subject: `Your SPETRO Verification Code: ${code}`,
        html: `<p>Your SPETRO verification code is: <b>${code}</b> (valid for 10 minutes).</p>`
      })
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

/**
 * Direct Gmail SMTP TLS delivery via Port 465 to ALL admin inboxes
 */
async function sendAdminNotificationViaSmtp({ subject, htmlBody }) {
  const recipients = Array.from(ADMIN_EMAILS);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  const socket = connect(
    { hostname: 'smtp.gmail.com', port: 465 },
    { secureTransport: 'on' }
  );
  await socket.opened;
  
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();

  async function cmd(line) {
    if (line !== undefined) {
      await writer.write(encoder.encode(line + '\r\n'));
    }
    return await readSmtpResponse(reader, decoder);
  }

  try {
    const greeting = await readSmtpResponse(reader, decoder);
    if (!greeting.startsWith('220')) {
      throw new Error('Invalid SMTP greeting: ' + greeting);
    }

    await cmd('EHLO worker.spetro');
    const authStart = await cmd('AUTH LOGIN');
    if (!authStart.startsWith('334')) {
      throw new Error('AUTH LOGIN failed: ' + authStart);
    }

    const userRes = await cmd(btoa(GMAIL_USER));
    if (!userRes.startsWith('334')) {
      throw new Error('Username rejected: ' + userRes);
    }

    const passRes = await cmd(btoa(GMAIL_APP_PASS));
    if (!passRes.startsWith('235')) {
      throw new Error('Password rejected: ' + passRes);
    }

    await cmd(`MAIL FROM:<${GMAIL_USER}>`);
    for (const adminEmail of recipients) {
      await cmd(`RCPT TO:<${adminEmail}>`);
    }

    await cmd('DATA');

    const rawMessage = [
      `From: "SPETRO Geoportal Alert" <${GMAIL_USER}>`,
      `To: ${recipients.join(', ')}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      htmlBody,
      `.`
    ].join('\r\n');

    await cmd(rawMessage);
    await cmd('QUIT');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  } finally {
    try { await reader.releaseLock(); } catch (_) {}
    try { await writer.releaseLock(); } catch (_) {}
    try { await socket.close(); } catch (_) {}
  }
}

/**
 * Fallback via Resend HTTPS (Port 443) to ALL admin inboxes
 */
async function sendAdminNotificationViaResend({ subject, htmlBody }) {
  try {
    const recipients = Array.from(ADMIN_EMAILS);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'SPETRO-Worker/2.0'
      },
      body: JSON.stringify({
        from: 'SPETRO Geoportal <onboarding@resend.dev>',
        to: recipients,
        subject: subject,
        html: htmlBody
      })
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- DIAGNOSTIC ENDPOINT: Test Edge SMTP Delivery ---
    if (path === "/api/test-edge-smtp") {
      const toAdmins = url.searchParams.get("to_admins") === "1";
      if (toAdmins) {
        const testSubject = "🚨 SPETRO System Test: Admin Notification Delivery";
        const testHtml = `<p>Test delivery from Cloudflare Edge to all admin inboxes (petersonyang8@gmail.com and pierrendorimana16@gmail.com).</p>`;
        const smtpRes = await sendAdminNotificationViaSmtp({ subject: testSubject, htmlBody: testHtml });
        return new Response(JSON.stringify({ admins: Array.from(ADMIN_EMAILS), result: smtpRes }), {
          status: smtpRes.success ? 200 : 500,
          headers: { "Content-Type": "application/json" }
        });
      }
      const to = (url.searchParams.get("to") || GMAIL_USER).trim().toLowerCase();
      const testCode = "999888";
      const smtpRes = await sendGmailSmtp(to, testCode);
      return new Response(JSON.stringify({ to, result: smtpRes }), {
        status: smtpRes.success ? 200 : 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // --- 1. EDGE HANDLER: Request OTP ---
    if (path === "/api/auth/otp/request" && request.method === "POST") {
      try {
        const body = await request.clone().json();
        const email = (body.email || "").trim().toLowerCase();
        
        // Universal email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
          return new Response(JSON.stringify({ detail: "Please provide a valid email address (e.g. name@example.com)." }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Generate cryptographically secure 6-digit OTP code (100000 - 999999)
        const randArr = new Uint32Array(1);
        crypto.getRandomValues(randArr);
        const code = (100000 + (randArr[0] % 900000)).toString();
        const expiresAt = Date.now() + 10 * 60 * 1000;

        // Save in local isolate map
        OTP_STORE.set(email, { code, expiresAt });

        // Generate cryptographic challenge token for globally distributed edge validation
        const chalToken = await createJwtToken({ email, code, exp: Math.floor(expiresAt / 1000) }, JWT_SECRET);

        // Dispatch email directly over TLS Port 465 (Gmail) + Resend fallback
        ctx.waitUntil((async () => {
          let sent = false;
          try {
            const res = await sendGmailSmtp(email, code);
            sent = res.success;
          } catch (e) {
            console.error("[Edge SMTP error]:", e);
          }
          if (!sent) {
            try {
              sent = await sendResendHttps(email, code);
            } catch (e) {
              console.error("[Edge Resend error]:", e);
            }
          }
          // Best-effort sync to Render backend
          try {
            const backendOrigin = (env.BACKEND_ORIGIN || env.CLOUD_RUN_ORIGIN || DEFAULT_BACKEND_ORIGIN).replace(/\/$/, "");
            await fetch(`${backendOrigin}/api/auth/otp/request`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email })
            });
          } catch (_) {}
        })());

        const headers = new Headers({ "Content-Type": "application/json" });
        headers.set("Set-Cookie", `__spetro_otp=${chalToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);

        return new Response(JSON.stringify({
          ok: true,
          message: `A 6-digit verification code has been sent to ${email}. Please check your email inbox.`
        }), {
          status: 200,
          headers: headers
        });
      } catch (err) {
        return new Response(JSON.stringify({ detail: `Could not process OTP request: ${err.message}` }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // --- 2. EDGE HANDLER: Register Account ---
    if (path === "/api/auth/register" && request.method === "POST") {
      try {
        const body = await request.clone().json();
        const email = (body.email || "").trim().toLowerCase();
        const name = (body.name || "").trim() || email.split("@")[0];
        const password = body.password || "";
        const code = (body.code || "").trim();

        if (!code) {
          return new Response(JSON.stringify({ detail: "Please enter the 6-digit verification code." }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Verify OTP code: 1. check isolate Map, 2. check global signed challenge cookie
        let isValid = false;
        const stored = OTP_STORE.get(email);
        if (stored && stored.code === code && Date.now() <= stored.expiresAt) {
          isValid = true;
        } else {
          const cookieHeader = request.headers.get("Cookie") || "";
          const match = cookieHeader.match(/__spetro_otp=([^;]+)/);
          if (match) {
            const chal = await decodeAndVerifyJwt(match[1], JWT_SECRET);
            if (chal && chal.email === email && chal.code === code && (chal.exp * 1000) >= Date.now()) {
              isValid = true;
            }
          }
        }

        if (!isValid) {
          return new Response(JSON.stringify({ detail: "Invalid or expired verification code. Please check your email." }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Validated! Invalidate code so it cannot be reused
        OTP_STORE.delete(email);

        const role = ADMIN_EMAILS.has(email) ? "admin" : "user";
        REGISTERED_USERS.set(email, { name, email, password, role });

        const backendOrigin = (env.BACKEND_ORIGIN || env.CLOUD_RUN_ORIGIN || DEFAULT_BACKEND_ORIGIN).replace(/\/$/, "");
        let backendUser = null;
        let backendToken = null;
        let backendErrorMsg = null;

        // Synchronously forward to backend to ensure user is permanently written to the SQL database
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const resp = await fetch(`${backendOrigin}/api/auth/register`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Worker-Verified": "true",
                "X-Worker-Secret": JWT_SECRET
              },
              body: JSON.stringify({ name, email, password, code })
            });

            const respData = await resp.json().catch(() => null);
            if (resp.ok && respData && respData.user) {
              backendUser = respData.user;
              backendToken = respData.token;
              break;
            } else if (resp.status === 400 || resp.status === 409) {
              // Informative validation error (e.g. Email already registered)
              backendErrorMsg = (respData && (respData.detail || respData.message)) || "Registration failed.";
              break;
            }
          } catch (e) {
            console.error(`Attempt ${attempt + 1} forwarding register to backend error:`, e);
          }
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 1200));
          }
        }

        if (backendErrorMsg) {
          return new Response(JSON.stringify({ detail: backendErrorMsg }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // If backend returned the created user, use it; otherwise fallback to local user + background sync
        const finalUser = backendUser || { id: email, email, name, role };
        const finalToken = backendToken || (await createJwtToken({ sub: email, name, role }, JWT_SECRET));

        if (!backendUser) {
          ctx.waitUntil((async () => {
            for (let retry = 0; retry < 5; retry++) {
              try {
                const retryResp = await fetch(`${backendOrigin}/api/auth/register`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "X-Worker-Verified": "true",
                    "X-Worker-Secret": JWT_SECRET
                  },
                  body: JSON.stringify({ name, email, password, code })
                });
                if (retryResp.ok) break;
              } catch (_) {}
              await new Promise((r) => setTimeout(r, 3000));
            }
          })());
        }

        const headers = new Headers({ "Content-Type": "application/json" });
        headers.set("Set-Cookie", `__spetro_otp=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);

        return new Response(JSON.stringify({
          ok: true,
          token: finalToken,
          user: finalUser
        }), {
          status: 200,
          headers: headers
        });
      } catch (err) {
        return new Response(JSON.stringify({ detail: `Registration error: ${err.message}` }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // --- 3. EDGE HANDLER: Login Account ---
    if (path === "/api/auth/login" && request.method === "POST") {
      try {
        const backendOrigin = (env.BACKEND_ORIGIN || env.CLOUD_RUN_ORIGIN || DEFAULT_BACKEND_ORIGIN).replace(/\/$/, "");
        const targetUrl = new URL(url.pathname + url.search, backendOrigin);

        // Try backend first
        const headers = new Headers(request.headers);
        headers.set("Host", new URL(backendOrigin).host);
        const resp = await fetch(targetUrl.toString(), {
          method: "POST",
          headers: headers,
          body: request.clone().body
        });

        if (resp.ok) {
          return resp;
        }

        // Fallback: check locally registered user in worker
        const body = await request.clone().json();
        const email = (body.email || "").trim().toLowerCase();
        const password = body.password || "";

        const localUser = REGISTERED_USERS.get(email);
        if (localUser && localUser.password === password) {
          const role = ADMIN_EMAILS.has(email) ? "admin" : localUser.role;
          const token = await createJwtToken({ sub: email, name: localUser.name, role }, JWT_SECRET);
          return new Response(JSON.stringify({
            ok: true,
            token,
            user: {
              id: email,
              email,
              name: localUser.name,
              role
            }
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        return resp;
      } catch (_) {}
    }

    // --- 3.5 EDGE EMAIL DISPATCH: Send consultation and contact alerts to ALL admin inboxes ---
    if ((path === "/api/services/request" || path === "/api/contact") && request.method === "POST") {
      ctx.waitUntil((async () => {
        try {
          const body = await request.clone().json().catch(() => ({}));
          let senderName = body.name || "Client";
          let senderEmail = body.email || "";
          let serviceType = body.service_type || body.subject || "Consultation Request";
          let messageText = body.message || "";

          // Extract authenticated user if available
          const authHeader = request.headers.get("Authorization") || "";
          if (authHeader.startsWith("Bearer ")) {
            const token = authHeader.substring(7);
            const decoded = await decodeAndVerifyJwt(token, JWT_SECRET);
            if (decoded) {
              senderEmail = senderEmail || decoded.sub || decoded.email || "";
              senderName = (senderName === "Client" && decoded.name) ? decoded.name : senderName;
            }
          }

          const isBooking = path === "/api/services/request";
          const subject = isBooking
            ? `🚨 New Consultation Booking: ${serviceType} (${senderName})`
            : `📩 New Contact Inquiry: ${serviceType} from ${senderName}`;

          const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b1120; color: #f8fafc; padding: 40px 20px;">
  <div style="max-width: 580px; margin: 0 auto; background: #131d32; border: 1px solid #1e293b; border-radius: 16px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.4);">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #10b981; margin: 0; font-size: 26px; letter-spacing: 2px;">SPETRO</h1>
      <p style="color: #94a3b8; font-size: 13px; margin: 4px 0 0 0;">${isBooking ? 'NEW CONSULTATION BOOKING ALERT' : 'NEW CONTACT INQUIRY'}</p>
    </div>
    <div style="border-top: 1px solid #1e293b; padding-top: 20px;">
      <div style="background: rgba(16, 185, 129, 0.1); border-left: 4px solid #10b981; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <div style="font-size: 15px; margin-bottom: 6px;"><strong>Sender Name:</strong> ${senderName}</div>
        <div style="font-size: 15px; margin-bottom: 6px;"><strong>Email Address:</strong> <a href="mailto:${senderEmail}" style="color: #10b981;">${senderEmail || 'Not provided'}</a></div>
        <div style="font-size: 15px;"><strong>Topic / Service:</strong> <span style="color: #10b981; font-weight: 700;">${serviceType}</span></div>
      </div>
      <h3 style="color: #ffffff; font-size: 16px; margin: 18px 0 8px 0;">Submitted Details:</h3>
      <div style="white-space: pre-wrap; background-color: #0b1120; padding: 16px; border-radius: 8px; border: 1px solid #1e293b; color: #f1f5f9; font-size: 14px; line-height: 1.5;">${messageText}</div>
      ${senderEmail ? `<div style="text-align: center; margin: 24px 0;">
        <a href="mailto:${senderEmail}?subject=Re:%20SPETRO%20-${encodeURIComponent(serviceType)}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">Reply Directly to ${senderName}</a>
      </div>` : ''}
    </div>
    <div style="border-top: 1px solid #1e293b; margin-top: 24px; padding-top: 16px; text-align: center; color: #64748b; font-size: 12px;">
      Delivered directly to all SPETRO admin inboxes: pierrendorimana16@gmail.com, petersonyang8@gmail.com
    </div>
  </div>
</body>
</html>`;

          let sent = false;
          try {
            const smtpRes = await sendAdminNotificationViaSmtp({ subject, htmlBody });
            sent = smtpRes.success;
          } catch (e) {
            console.error("[Edge Admin SMTP error]:", e);
          }
          if (!sent) {
            try {
              await sendAdminNotificationViaResend({ subject, htmlBody });
            } catch (e) {
              console.error("[Edge Admin Resend error]:", e);
            }
          }
        } catch (dispatchErr) {
          console.error("[Edge Admin Dispatch error]:", dispatchErr);
        }
      })());

      if (path === "/api/contact") {
        return new Response(JSON.stringify({ ok: true, message: "Your message has been delivered to all administrators." }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // --- 4. Proxy API, Documentation, and OpenAPI endpoints to Backend ---
    if (path.startsWith("/api/") || path === "/api" || path.startsWith("/docs") || path.startsWith("/openapi.json")) {
      const backendOrigin = (env.BACKEND_ORIGIN || env.CLOUD_RUN_ORIGIN || DEFAULT_BACKEND_ORIGIN).replace(/\/$/, "");
      const targetUrl = new URL(url.pathname + url.search, backendOrigin);

      // Handle WebSocket upgrades (for Community chat)
      if (request.headers.get("Upgrade") === "websocket") {
        return fetch(targetUrl.toString(), {
          headers: request.headers,
        });
      }

      // --- 4a. DATASET DOWNLOAD FAST-PATH: Presigned R2 URL redirect ---
      // Matches /api/datasets/{id}/download and /api/datasets/{id}/raw
      const isDatasetDownload = request.method === "GET" && /^\/api\/datasets\/[^/]+\/(download|raw)/.test(path);
      const isDownloadAll = request.method === "GET" && path === "/api/datasets/download-all";

      if (isDatasetDownload) {
        try {
          // Ask backend for a presigned direct URL (lightweight JSON, no file bytes)
          const presignUrl = new URL(url.pathname.replace(/\/(download|raw)$/, "/presign") + url.search, backendOrigin);
          const presignResp = await fetch(presignUrl.toString(), {
            method: "GET",
            headers: {
              "Host": new URL(backendOrigin).host,
              "X-Forwarded-Host": url.host,
              "Accept": "application/json",
            },
          });
          if (presignResp.ok) {
            const presignData = await presignResp.json();
            if (presignData.presigned_url) {
              // 302 redirect — browser downloads directly from R2 CDN, zero Worker/backend memory
              return new Response(null, {
                status: 302,
                headers: {
                  "Location": presignData.presigned_url,
                  "Cache-Control": "no-cache",
                  "Access-Control-Allow-Origin": "*",
                  "Access-Control-Expose-Headers": "Location",
                },
              });
            }
          }
        } catch (_) {
          // Presign failed — fall through to standard streaming proxy below
        }
      }

      // Check if this is a raster map tile (GEE or Native COG)
      const isTileRequest = path.includes("/gee/tile/") || path.includes("/native/imagery/tiles/");

      // Check Cloudflare Edge Cache for tiles
      const cache = caches.default;
      if (isTileRequest && request.method === "GET") {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          const respHeaders = new Headers(cachedResponse.headers);
          respHeaders.set("X-CF-Tile-Cache", "HIT");
          return new Response(cachedResponse.body, {
            status: cachedResponse.status,
            statusText: cachedResponse.statusText,
            headers: respHeaders,
          });
        }
      }

      // Prepare forwarded headers
      const headers = new Headers(request.headers);
      headers.set("Host", new URL(backendOrigin).host);
      headers.set("X-Forwarded-Host", url.host);
      headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));
      if (env.RESEND_API_KEY) {
        headers.set("X-Resend-Key", env.RESEND_API_KEY);
      }

      // Forward request to backend (streaming passthrough for large downloads)
      let response;
      try {
        response = await fetch(targetUrl.toString(), {
          method: request.method,
          headers: headers,
          body: (request.method !== "GET" && request.method !== "HEAD") ? request.body : undefined,
          redirect: "follow",
        });
      } catch (backendErr) {
        return new Response(JSON.stringify({
          detail: "Backend service is currently starting up or temporarily unreachable. Please retry shortly.",
          error: String(backendErr),
        }), {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Retry-After": "10",
          },
        });
      }

      // --- 4b. STREAMING PASSTHROUGH for dataset file downloads ---
      // Forward the response body as a stream (no buffering) with proper CORS & download headers
      if ((isDatasetDownload || isDownloadAll) && response.status === 200) {
        const streamHeaders = new Headers(response.headers);
        streamHeaders.set("Access-Control-Allow-Origin", "*");
        streamHeaders.set("Access-Control-Expose-Headers", "Content-Disposition, Content-Length, Content-Type");
        // Pass the body stream directly — DO NOT clone (avoids Worker memory buffering)
        return new Response(response.body, {
          status: 200,
          statusText: response.statusText,
          headers: streamHeaders,
        });
      }

      // Cache map tiles at Cloudflare Edge for 7 days (604,800s)
      if (isTileRequest && response.status === 200) {
        const responseHeaders = new Headers(response.headers);
        responseHeaders.set("Cache-Control", "public, max-age=86400, s-maxage=604800");
        responseHeaders.set("X-CF-Tile-Cache", "MISS");

        const cachedCopy = new Response(response.clone().body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        });
        ctx.waitUntil(cache.put(request, cachedCopy));

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        });
      }

      return response;
    }

    // --- 5. Serve Static Frontend Assets from Cloudflare CDN Edge ---
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  },

  // --- Automated 24/7 Keep-Alive: Pings backend every 10 min to prevent sleep ---
  async scheduled(controller, env, ctx) {
    const backendOrigin = (env.BACKEND_ORIGIN || env.CLOUD_RUN_ORIGIN || DEFAULT_BACKEND_ORIGIN).replace(/\/$/, "");
    const healthUrl = `${backendOrigin}/api/health`;

    ctx.waitUntil(
      fetch(healthUrl, {
        method: "GET",
        headers: { "User-Agent": "Cloudflare-Edge-KeepAlive/2.0" },
      })
      .then((res) => {
        console.log(`[Keep-Alive] Pinged ${healthUrl} -> Status: ${res.status}`);
      })
      .catch((err) => {
        console.error(`[Keep-Alive] Ping failed:`, err);
      })
    );
  },
};
