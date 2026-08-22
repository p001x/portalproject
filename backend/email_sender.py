import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_HERE = Path(__file__).resolve().parent
_ENV_FILE = _HERE / ".env"

def send_reset_email(to_email: str, reset_link: str, user_name: str = "Valued User"):
    """
    Sends a password reset email via SMTP.
    Requires SMTP_SERVER, SMTP_PORT, SMTP_USER, SMTP_PASSWORD to be set in environment variables.
    """
    try:
        from dotenv import load_dotenv
        load_dotenv(_ENV_FILE, override=True)
    except ImportError:
        pass

    smtp_server = os.environ.get("SMTP_SERVER")
    smtp_port = os.environ.get("SMTP_PORT")
    smtp_user = os.environ.get("SMTP_USER")
    smtp_password = os.environ.get("SMTP_PASSWORD")

    if not all([smtp_server, smtp_port, smtp_user, smtp_password]):
        logger.warning(f"SMTP not fully configured. Mocking email to {to_email}. Link: {reset_link}")
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Password Reset Request"
        msg["From"] = smtp_user
        msg["To"] = to_email

        text = f"Hello {user_name},\n\nYou requested a password reset for your SPETRO Geo-Analysis Portal account. Please click the link below to securely reset your password. This link is valid for 5 minutes.\n\n{reset_link}\n\nIf you did not request this, please ignore this email and your password will remain unchanged.\n\nBest regards,\nThe SPETRO Team"
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
              <p>For your security, this request is highly time-sensitive. Please click the button below within the next <strong>5 minutes</strong> to choose a new password.</p>
              
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

        part1 = MIMEText(text, "plain")
        part2 = MIMEText(html, "html")
        msg.attach(part1)
        msg.attach(part2)

        server = smtplib.SMTP(smtp_server, int(smtp_port))
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
