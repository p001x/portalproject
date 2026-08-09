import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def send_consultation_alert(user_email: str, service_type: str, message: str):
    """
    Sends an email notification using SMTP credentials from the environment.
    If credentials are missing or invalid, logs the error instead of crashing.
    """
    smtp_email = os.environ.get("SMTP_EMAIL")
    smtp_password = os.environ.get("SMTP_PASSWORD")

    if not smtp_email or not smtp_password:
        print(f"Warning: SMTP_EMAIL or SMTP_PASSWORD not set. Cannot send email alert for {service_type}.")
        return

    try:
        msg = MIMEMultipart()
        msg['From'] = smtp_email
        msg['To'] = smtp_email  # Sending to yourself as an alert
        msg['Subject'] = f"🚨 New Premium Service Request: {service_type}"

        body = f"""
You have received a new Premium Service request!

User Email: {user_email}
Service Requested: {service_type}

Message/Requirements:
{message}

---
Please reply directly to the user to schedule the session.
"""
        msg.attach(MIMEText(body, 'plain'))

        # Standard Gmail SMTP connection
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.login(smtp_email, smtp_password)
            server.send_message(msg)
            
        print(f"Successfully sent email alert for service: {service_type}")
    except Exception as e:
        print(f"Error sending email alert: {e}")
