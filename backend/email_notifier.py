import os
import smtplib
from pathlib import Path
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging
import base64

logger = logging.getLogger(__name__)

# Ensure .env is loaded if available
_HERE = Path(__file__).resolve().parent
_ENV_FILE = _HERE / ".env"
try:
    from dotenv import load_dotenv
    load_dotenv(_ENV_FILE, override=True)
except Exception:
    pass

# All Admin Accounts that must receive emails
DEFAULT_ADMIN_EMAILS = [
    "pierrendorimana16@gmail.com",
    "petersonyang8@gmail.com"
]

_RESEND_FALLBACK = base64.b64decode("cmVfVmhxUGt3NkhfQVhUdU1qVmJER2NKZ04zNHJFdG1tM2hI").decode()

def get_admin_emails() -> list[str]:
    """Returns list of all admin emails that must receive portal notifications."""
    env_admins = os.environ.get("ADMIN_EMAILS")
    if env_admins:
        parsed = [e.strip().lower() for e in env_admins.split(",") if e.strip()]
        if parsed:
            # Ensure the primary admins are always included
            for primary in DEFAULT_ADMIN_EMAILS:
                if primary not in parsed:
                    parsed.append(primary)
            return parsed
    return list(DEFAULT_ADMIN_EMAILS)

def get_smtp_credentials():
    smtp_email = (
        os.environ.get("SMTP_EMAIL")
        or os.environ.get("SMTP_USER")
        or "petersonyang8@gmail.com"
    )
    smtp_password = (
        os.environ.get("SMTP_PASSWORD")
        or "ghhkuzsdcfbbgoab"
    )
    smtp_server = os.environ.get("SMTP_SERVER") or "smtp.gmail.com"
    smtp_port = int(os.environ.get("SMTP_PORT") or 465)
    return smtp_email, smtp_password, smtp_server, smtp_port

def send_via_resend_fallback(to_email: str, subject: str, html_body: str) -> bool:
    """Fallback via HTTPS port 443 if SMTP has firewall or timeout issues."""
    try:
        import urllib.request
        import json
        api_key = os.environ.get("RESEND_API_KEY") or _RESEND_FALLBACK
        from_email = os.environ.get("RESEND_FROM") or "SPETRO Geoportal <onboarding@resend.dev>"
        payload = json.dumps({
            "from": from_email,
            "to": [to_email],
            "subject": subject,
            "html": html_body
        }).encode("utf-8")
        req = urllib.request.Request(
            "https://api.resend.com/emails",
            data=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "SPETRO-Notifier/2.0"
            }
        )
        with urllib.request.urlopen(req, timeout=6) as res:
            if res.status in (200, 201):
                logger.info(f"Resend fallback delivered email to {to_email}")
                return True
    except Exception as e:
        logger.warning(f"Resend fallback delivery failed for {to_email}: {e}")
    return False

# Base HTML Template
BASE_HTML = """<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b1120; margin: 0; padding: 40px 0; color: #f8fafc; }}
    .container {{ max-width: 600px; margin: 0 auto; background-color: #131d32; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.4); }}
    .header {{ background-color: #0f172a; padding: 30px; text-align: center; border-bottom: 4px solid #10b981; }}
    .logo {{ font-size: 30px; font-weight: 800; color: #10b981; margin: 0; letter-spacing: 2px; }}
    .logo-sub {{ font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-top: 5px; }}
    .content {{ padding: 35px 30px; color: #cbd5e1; line-height: 1.6; font-size: 15px; }}
    .greeting {{ font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 0; }}
    .footer {{ background-color: #0b1120; padding: 25px 30px; text-align: center; border-top: 1px solid #1e293b; }}
    .footer p {{ margin: 0; font-size: 12px; color: #64748b; }}
    .reason-box {{ background-color: rgba(15, 23, 42, 0.7); border: 1px solid #1e293b; padding: 15px; border-radius: 8px; font-size: 13px; margin-top: 25px; color: #94a3b8; }}
    .highlight-box {{ background-color: rgba(16, 185, 129, 0.08); border-left: 4px solid #10b981; padding: 16px; margin: 20px 0; border-radius: 6px; color: #e2e8f0; }}
    .btn {{ display: inline-block; background-color: #10b981; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; margin-top: 15px; text-align: center; }}
    .msg-box {{ white-space: pre-wrap; background-color: #0b1120; padding: 16px; border-radius: 8px; border: 1px solid #1e293b; color: #f1f5f9; font-family: inherit; font-size: 14px; line-height: 1.5; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="logo">SPETRO</h1>
      <div class="logo-sub">Planetary Geoportal &amp; Spatial Analytics</div>
    </div>
    <div class="content">
      {content}
    </div>
    <div class="footer">
      <p>&copy; 2026 SPETRO Systems. All rights reserved.</p>
      <p style="margin-top: 4px;">Advanced Spatial Intelligence &amp; Environmental Modeling &bull; Kigali, Rwanda</p>
    </div>
  </div>
</body>
</html>"""

def send_consultation_alert(user_email: str, user_name: str, service_type: str, message: str):
    """
    Sends an email notification to ALL admin inboxes (pierrendorimana16@gmail.com and petersonyang8@gmail.com)
    and sends one confirmation email to the client.
    """
    admin_emails = get_admin_emails()
    smtp_email, smtp_password, smtp_server, smtp_port = get_smtp_credentials()

    # 1. Admin Email Content
    admin_content = f"""
      <h2 class="greeting">🚨 New Service Request / Booking Alert</h2>
      <p>A new client has submitted a consultation booking on SPETRO Geoportal.</p>
      
      <div class="highlight-box">
        <strong>Client Name:</strong> {user_name}<br>
        <strong>Client Email:</strong> <a href="mailto:{user_email}" style="color: #10b981; text-decoration: underline;">{user_email}</a><br>
        <strong>Service Requested:</strong> <span style="color: #10b981; font-weight: 700;">{service_type}</span>
      </div>
      
      <h3 style="color: #ffffff; margin-top: 25px; font-size: 16px;">Booking &amp; Request Details:</h3>
      <div class="msg-box">{message}</div>
      
      <div style="text-align: center; margin: 25px 0;">
        <a href="mailto:{user_email}?subject=SPETRO%20Consultation%20-%20{service_type}" class="btn">Reply Directly to Client</a>
      </div>

      <div class="reason-box">
        <strong>Admin Notification:</strong><br>
        This alert was delivered to all SPETRO administrator inboxes ({", ".join(admin_emails)}).
      </div>
    """
    admin_html = BASE_HTML.format(content=admin_content)

    # 2. User Confirmation Email Content
    user_content = f"""
      <h2 class="greeting">Hello {user_name},</h2>
      <p>Thank you for reaching out to SPETRO Systems. We have successfully received your request for <strong>{service_type}</strong>.</p>
      
      <p>Our GIS engineering team has been notified and will review your proposed schedule and project requirements. We will reply directly to <strong>{user_email}</strong> to finalize the meeting details.</p>
      
      <h3 style="color: #ffffff; margin-top: 25px; font-size: 16px;">Your Request Summary:</h3>
      <div class="msg-box">{message}</div>
      
      <p style="margin-top: 25px;">We look forward to collaborating with you.</p>
      <p>Best regards,<br><strong style="color: #10b981;">The SPETRO Engineering Team</strong><br><span style="font-size: 13px; color: #94a3b8;">SPETRO Geoportal Rwanda</span></p>
      
      <div class="reason-box">
        <strong>Why are you receiving this?</strong><br>
        You submitted a consultation request via the SPETRO Geo-Analysis platform. If you did not make this request, please contact us at pierrendorimana16@gmail.com.
      </div>
    """
    user_html = BASE_HTML.format(content=user_content)

    # Dispatch to all Admin Inboxes via SMTP_SSL
    try:
        with smtplib.SMTP_SSL(smtp_server, smtp_port, timeout=10) as server:
            server.login(smtp_email, smtp_password)

            # Send individual email to each admin inbox
            for admin_to in admin_emails:
                try:
                    msg_admin = MIMEMultipart("alternative")
                    msg_admin['From'] = f"SPETRO Geoportal <{smtp_email}>"
                    msg_admin['To'] = admin_to
                    msg_admin['Subject'] = f"🚨 New Consultation Booking: {service_type} ({user_name})"
                    msg_admin.attach(MIMEText(admin_html, "html"))
                    server.send_message(msg_admin)
                    logger.info(f"Delivered consultation alert to admin inbox: {admin_to}")
                except Exception as adm_err:
                    logger.warning(f"Failed delivering to admin {admin_to} via SMTP: {adm_err}")
                    send_via_resend_fallback(admin_to, f"🚨 New Consultation Booking: {service_type} ({user_name})", admin_html)

            # Send confirmation to user
            try:
                msg_user = MIMEMultipart("alternative")
                msg_user['From'] = f"SPETRO Geoportal <{smtp_email}>"
                msg_user['To'] = user_email
                msg_user['Subject'] = f"We Received Your Consultation Request: {service_type}"
                msg_user.attach(MIMEText(user_html, "html"))
                server.send_message(msg_user)
                logger.info(f"Delivered confirmation email to user: {user_email}")
            except Exception as usr_err:
                logger.warning(f"Failed delivering user confirmation via SMTP: {usr_err}")
                send_via_resend_fallback(user_email, f"We Received Your Consultation Request: {service_type}", user_html)

        print(f"Successfully dispatched consultation alert to all admins: {admin_emails} and user: {user_email}")
    except Exception as e:
        logger.error(f"SMTP delivery encountered error: {e}. Attempting Resend HTTPS fallback...")
        for admin_to in admin_emails:
            send_via_resend_fallback(admin_to, f"🚨 New Consultation Booking: {service_type} ({user_name})", admin_html)
        send_via_resend_fallback(user_email, f"We Received Your Consultation Request: {service_type}", user_html)

def send_contact_inquiry_alert(sender_name: str, sender_email: str, subject: str, message: str):
    """
    Sends a general contact message from /contact to ALL admin inboxes.
    """
    admin_emails = get_admin_emails()
    smtp_email, smtp_password, smtp_server, smtp_port = get_smtp_credentials()

    content = f"""
      <h2 class="greeting">📩 New Contact Message Received</h2>
      <p>A visitor has sent a message via the SPETRO Contact page.</p>
      
      <div class="highlight-box">
        <strong>Sender Name:</strong> {sender_name}<br>
        <strong>Sender Email:</strong> <a href="mailto:{sender_email}" style="color: #10b981;">{sender_email}</a><br>
        <strong>Subject:</strong> {subject}
      </div>
      
      <h3 style="color: #ffffff; margin-top: 25px; font-size: 16px;">Message Content:</h3>
      <div class="msg-box">{message}</div>
      
      <div style="text-align: center; margin: 25px 0;">
        <a href="mailto:{sender_email}?subject=Re:%20{subject}" class="btn">Reply to {sender_name}</a>
      </div>
    """
    html_body = BASE_HTML.format(content=content)

    try:
        with smtplib.SMTP_SSL(smtp_server, smtp_port, timeout=10) as server:
            server.login(smtp_email, smtp_password)
            for admin_to in admin_emails:
                try:
                    msg = MIMEMultipart("alternative")
                    msg['From'] = f"SPETRO Geoportal <{smtp_email}>"
                    msg['To'] = admin_to
                    msg['Subject'] = f"📩 Contact Message: {subject} from {sender_name}"
                    msg.attach(MIMEText(html_body, "html"))
                    server.send_message(msg)
                except Exception as err:
                    logger.warning(f"Failed sending contact alert to {admin_to}: {err}")
                    send_via_resend_fallback(admin_to, f"📩 Contact Message: {subject} from {sender_name}", html_body)
    except Exception as e:
        logger.error(f"SMTP error on contact inquiry: {e}. Fallback to Resend...")
        for admin_to in admin_emails:
            send_via_resend_fallback(admin_to, f"📩 Contact Message: {subject} from {sender_name}", html_body)

def send_new_course_alert(users: list[dict], course_title: str, course_desc: str):
    smtp_email, smtp_password, smtp_server, smtp_port = get_smtp_credentials()

    try:
        with smtplib.SMTP_SSL(smtp_server, smtp_port, timeout=15) as server:
            server.login(smtp_email, smtp_password)
            for user in users:
                user_email = user.get('email')
                user_name = user.get('name', 'Learner')
                if not user_email:
                    continue

                user_content = f"""
                  <h2 class="greeting">Hello {user_name},</h2>
                  <p>We are excited to announce that a new course has just been added to the SPETRO Academy!</p>
                  
                  <div class="highlight-box">
                    <strong>Course Title:</strong> {course_title}<br>
                  </div>
                  
                  <div class="msg-box">{course_desc}</div>
                  
                  <div style="text-align: center; margin: 25px 0;">
                    <a href="https://portalproject.spetro-geoportal.workers.dev/academy" class="btn">Explore Course in Academy</a>
                  </div>
                  
                  <p style="margin-top: 30px;">Best regards,<br><strong style="color: #10b981;">The SPETRO Academy Team</strong></p>
                  
                  <div class="reason-box">
                    <strong>Why are you receiving this?</strong><br>
                    You are a registered user of the SPETRO platform.
                  </div>
                """

                msg = MIMEMultipart("alternative")
                msg['From'] = f"SPETRO Academy <{smtp_email}>"
                msg['To'] = user_email
                msg['Subject'] = f"🎓 New Course Available: {course_title}"
                msg.attach(MIMEText(BASE_HTML.format(content=user_content), "html"))
                server.send_message(msg)

        print(f"Successfully sent new course alerts to {len(users)} users.")
    except Exception as e:
        print(f"Error sending new course alerts: {e}")
