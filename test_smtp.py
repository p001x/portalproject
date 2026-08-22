import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from dotenv import load_dotenv

load_dotenv("backend/.env")

smtp_server = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
smtp_port = os.environ.get("SMTP_PORT", "587")
smtp_user = os.environ.get("SMTP_USER")
smtp_password = os.environ.get("SMTP_PASSWORD")

print(f"Testing with User: {smtp_user}")

try:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Test Email Configuration"
    msg["From"] = smtp_user
    msg["To"] = smtp_user
    
    text = "If you are seeing this, your SMTP configuration is correct!"
    msg.attach(MIMEText(text, "plain"))
    
    print("Connecting to server...")
    server = smtplib.SMTP(smtp_server, int(smtp_port))
    server.set_debuglevel(1)
    server.starttls()
    print("Logging in...")
    server.login(smtp_user, smtp_password)
    print("Sending email...")
    server.sendmail(smtp_user, smtp_user, msg.as_string())
    server.quit()
    print("Success!")
except Exception as e:
    print(f"Error: {e}")
