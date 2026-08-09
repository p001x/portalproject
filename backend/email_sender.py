import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging

logger = logging.getLogger(__name__)

def send_reset_email(to_email: str, reset_link: str):
    """
    Sends a password reset email via SMTP.
    Requires SMTP_SERVER, SMTP_PORT, SMTP_USER, SMTP_PASSWORD to be set in environment variables.
    """
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

        text = f"You requested a password reset. Click the link below to reset your password:\n\n{reset_link}\n\nIf you did not request this, please ignore this email."
        html = f"""
        <html>
          <body>
            <h2>Password Reset Request</h2>
            <p>You requested a password reset. Click the link below to reset your password:</p>
            <p><a href="{reset_link}">Reset Password</a></p>
            <p>If you did not request this, please ignore this email.</p>
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
