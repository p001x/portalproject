import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_HERE = Path(__file__).resolve().parent
_ENV_FILE = _HERE / ".env"

def send_via_resend(to_email: str, subject: str, text: str, html: str, api_key: str = None) -> bool:
    """
    Sends email over HTTPS port 443 via Resend API.
    Never blocked by cloud firewalls.
    """
    try:
        from dotenv import load_dotenv
        load_dotenv(_ENV_FILE, override=True)
    except ImportError:
        pass

    if not api_key:
        api_key = os.environ.get("RESEND_API_KEY")
    from_email = os.environ.get("RESEND_FROM") or "SPETRO Geoportal <onboarding@resend.dev>"
    
    if not api_key:
        return False
        
    try:
        import urllib.request
        import json
        payload = json.dumps({
            "from": from_email,
            "to": [to_email],
            "subject": subject,
            "html": html,
            "text": text
        }).encode("utf-8")
        req = urllib.request.Request(
            "https://api.resend.com/emails",
            data=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        )
        with urllib.request.urlopen(req, timeout=5) as res:
            if res.status in (200, 201):
                logger.info(f"Resend HTTPS email successfully delivered to {to_email}")
                return True
    except Exception as e:
        logger.warning(f"Resend HTTPS delivery note for {to_email}: {e}")
        return False
    return False

def send_reset_email(to_email: str, reset_link: str, user_name: str = "Valued User", resend_key: str = None):
    """
    Sends a password reset email via Resend HTTPS (or fallback to SMTP).
    """
    try:
        from dotenv import load_dotenv
        load_dotenv(_ENV_FILE, override=True)
    except ImportError:
        pass

    smtp_server = os.environ.get("SMTP_SERVER") or "smtp.gmail.com"
    smtp_port = os.environ.get("SMTP_PORT") or "465"
    smtp_user = os.environ.get("SMTP_USER") or "petersonyang8@gmail.com"
    smtp_password = os.environ.get("SMTP_PASSWORD") or "ghhkuzsdcfbbgoab"

    if not all([smtp_server, smtp_port, smtp_user, smtp_password]):
        logger.warning(f"SMTP not fully configured. Mocking email to {to_email}.")
        print(f"\n=========================================\n"
              f"🔐 MOCK EMAIL SYSTEM (PASSWORD RESET)\n"
              f"Sending Reset Link to: {to_email}\n"
              f"LINK: {reset_link}\n"
              f"=========================================\n")
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Password Reset Request"
        msg["From"] = smtp_user
        msg["To"] = to_email

        text = f"Hello {user_name},\n\nYou requested a password reset for your SPETRO Geo-Analysis Portal account. Please click the link below to securely reset your password. This link is valid for 30 minutes.\n\n{reset_link}\n\nIf you did not request this, please ignore this email and your password will remain unchanged.\n\nBest regards,\nThe SPETRO Team"
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {{ font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 0; }}
            .container {{ max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }}
            .header {{ background-color: #0f172a; padding: 30px; text-align: center; border-bottom: 4px solid #10b981; }}
            .logo {{ font-size: 32px; font-weight: 800; color: #ffffff; margin: 0; letter-spacing: 2px; }}
            .logo-sub {{ font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-top: 5px; }}
            .content {{ padding: 40px 30px; color: #334155; line-height: 1.6; }}
            .greeting {{ font-size: 20px; font-weight: 600; color: #0f172a; margin-top: 0; }}
            .button-container {{ text-align: center; margin: 35px 0; }}
            .button {{ background-color: #10b981; color: #ffffff !important; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4); }}
            .footer {{ background-color: #f8fafc; padding: 25px 30px; text-align: center; border-top: 1px solid #e2e8f0; }}
            .footer p {{ margin: 0; font-size: 13px; color: #64748b; }}
            .reason-box {{ background-color: #f1f5f9; padding: 15px; border-radius: 8px; font-size: 13px; margin-top: 25px; color: #475569; }}
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 class="logo">SPETRO</h1>
              <div class="logo-sub">Geo Analysis & Integrated Portal Solutions</div>
            </div>
            <div class="content">
              <h2 class="greeting">Hello {user_name},</h2>
              <p>We received a request to reset the password associated with your SPETRO account (<strong>{to_email}</strong>).</p>
              <p>For your security, this request is time-sensitive. Please click the button below within the next <strong>30 minutes</strong> to choose a new password.</p>
              
              <div class="button-container">
                <a href="{reset_link}" class="button">Securely Reset Password</a>
              </div>
              
              <div class="reason-box">
                <strong>Why are you receiving this?</strong><br>
                You are receiving this email because a password reset was requested for your account on the SPETRO Geo-Analysis platform. If you did not make this request, you can safely ignore this email. Your password will not change and your account remains secure.
              </div>
            </div>
            <div class="footer">
              <p>&copy; 2026 SPETRO Systems. All rights reserved.</p>
              <p>Advanced Spatial Intelligence & Environmental Modeling</p>
            </div>
          </div>
        </body>
        </html>
        """

        # 1. Attempt delivery via Resend HTTPS (Port 443 - instantaneous and unblocked)
        if send_via_resend(to_email, "Password Reset Request - SPETRO Geoportal", text, html, api_key=resend_key):
            return

        part1 = MIMEText(text, "plain")
        part2 = MIMEText(html, "html")
        msg.attach(part1)
        msg.attach(part2)

        port = int(smtp_port)
        if port == 465:
            server = smtplib.SMTP_SSL(smtp_server, port, timeout=10)
        else:
            server = smtplib.SMTP(smtp_server, port, timeout=10)
            server.starttls()
        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_user, to_email, msg.as_string())
        server.quit()
        logger.info(f"Password reset email successfully sent to {to_email}")

    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        try:
            with open(_HERE / "smtp_error.txt", "w") as f:
                f.write(f"SMTP Error for {to_email}: {str(e)}\n")
        except Exception:
            pass

def send_otp_email(to_email: str, code: str, resend_key: str = None):
    """
    Sends a 6-digit OTP verification email via Resend HTTPS (or fallback to SMTP).
    """
    try:
        from dotenv import load_dotenv
        load_dotenv(_ENV_FILE, override=True)
    except ImportError:
        pass

    smtp_server = os.environ.get("SMTP_SERVER") or "smtp.gmail.com"
    smtp_port = os.environ.get("SMTP_PORT") or "465"
    smtp_user = os.environ.get("SMTP_USER") or "petersonyang8@gmail.com"
    smtp_password = os.environ.get("SMTP_PASSWORD") or "ghhkuzsdcfbbgoab"

    if not all([smtp_server, smtp_port, smtp_user, smtp_password]):
        logger.warning(f"SMTP not fully configured. Mocking OTP to {to_email}. CODE: {code}")
        # Print clearly to terminal for mock mode
        print(f"\n=========================================\n"
              f"🔐 MOCK SMS/EMAIL SYSTEM\n"
              f"Sending OTP Code to: {to_email}\n"
              f"CODE: {code}\n"
              f"=========================================\n")
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Your Verification Code: {code}"
        msg["From"] = smtp_user
        msg["To"] = to_email

        text = f"Hello,\n\nYour SPETRO verification code is {code}. It is valid for 10 minutes.\n\nIf you did not request this code, you can safely ignore this email.\n\nBest regards,\nThe SPETRO Team"
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {{ font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 0; }}
            .container {{ max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }}
            .header {{ background-color: #0f172a; padding: 30px; text-align: center; border-bottom: 4px solid #3b82f6; }}
            .logo {{ font-size: 32px; font-weight: 800; color: #ffffff; margin: 0; letter-spacing: 2px; }}
            .logo-sub {{ font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-top: 5px; }}
            .content {{ padding: 40px 30px; color: #334155; line-height: 1.6; text-align: center; }}
            .greeting {{ font-size: 20px; font-weight: 600; color: #0f172a; margin-top: 0; }}
            .code-box {{ background-color: #eff6ff; border: 2px dashed #93c5fd; border-radius: 8px; padding: 20px; margin: 30px auto; max-width: 300px; }}
            .code {{ font-size: 42px; font-weight: 800; letter-spacing: 12px; color: #2563eb; margin: 0; margin-left: 12px; }}
            .footer {{ background-color: #f8fafc; padding: 25px 30px; text-align: center; border-top: 1px solid #e2e8f0; }}
            .footer p {{ margin: 0; font-size: 13px; color: #64748b; }}
            .reason-box {{ background-color: #f1f5f9; padding: 15px; border-radius: 8px; font-size: 13px; margin-top: 25px; color: #475569; text-align: left; }}
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 class="logo">SPETRO</h1>
              <div class="logo-sub">Geo Analysis & Integrated Portal Solutions</div>
            </div>
            <div class="content">
              <h2 class="greeting">Authentication Required</h2>
              <p>You have requested to verify your email address (<strong>{to_email}</strong>) for access to the SPETRO platform.</p>
              <p>Please enter the following 6-digit secure verification code to complete your request:</p>
              
              <div class="code-box">
                <div class="code">{code}</div>
              </div>
              
              <p>For security purposes, this code will expire in <strong>10 minutes</strong>.</p>
              
              <div class="reason-box">
                <strong>Didn't request this code?</strong><br>
                If you did not attempt to sign in or register for a SPETRO account, someone else may have entered your email by mistake. You can safely delete this email, and your account will remain secure.
              </div>
            </div>
            <div class="footer">
              <p>&copy; 2026 SPETRO Systems. All rights reserved.</p>
              <p>Advanced Spatial Intelligence & Environmental Modeling</p>
            </div>
          </div>
        </body>
        </html>
        """

        # 1. Attempt delivery via Resend HTTPS (Port 443 - instantaneous and unblocked)
        if send_via_resend(to_email, f"Your Verification Code: {code}", text, html, api_key=resend_key):
            return True

        part1 = MIMEText(text, "plain")
        part2 = MIMEText(html, "html")
        msg.attach(part1)
        msg.attach(part2)

        port = int(smtp_port)
        if port == 465:
            server = smtplib.SMTP_SSL(smtp_server, port, timeout=10)
        else:
            server = smtplib.SMTP(smtp_server, port, timeout=10)
            server.starttls()
        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_user, to_email, msg.as_string())
        server.quit()
        logger.info(f"OTP email successfully sent to {to_email}")
        return True

    except Exception as e:
        logger.error(f"Failed to send OTP to {to_email}: {e}")
        return False

