import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def send_consultation_alert(user_email: str, user_name: str, service_type: str, message: str):
    """
    Sends an email notification using SMTP credentials from the environment.
    Sends one alert to the admin and one confirmation to the user.
    """
    smtp_email = os.environ.get("SMTP_EMAIL")
    smtp_password = os.environ.get("SMTP_PASSWORD")

    if not smtp_email or not smtp_password:
        print(f"Warning: SMTP_EMAIL or SMTP_PASSWORD not set. Cannot send email alert for {service_type}.")
        return

    # Base HTML Template
    base_html = """
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
        .footer {{ background-color: #f8fafc; padding: 25px 30px; text-align: center; border-top: 1px solid #e2e8f0; }}
        .footer p {{ margin: 0; font-size: 13px; color: #64748b; }}
        .reason-box {{ background-color: #f1f5f9; padding: 15px; border-radius: 8px; font-size: 13px; margin-top: 25px; color: #475569; }}
        .highlight-box {{ background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px; }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 class="logo">SPETRO</h1>
          <div class="logo-sub">Geo Analysis & Integrated Portal Solutions</div>
        </div>
        <div class="content">
          {content}
        </div>
        <div class="footer">
          <p>&copy; 2026 SPETRO Systems. All rights reserved.</p>
          <p>Advanced Spatial Intelligence & Environmental Modeling</p>
        </div>
      </div>
    </body>
    </html>
    """

    try:
        # 1. Send Alert to Admin
        admin_content = f"""
          <h2 class="greeting">New Service Request</h2>
          <p>A new premium service consultation has been requested.</p>
          
          <div class="highlight-box">
            <strong>Client Name:</strong> {user_name}<br>
            <strong>Client Email:</strong> {user_email}<br>
            <strong>Service Requested:</strong> {service_type}
          </div>
          
          <h3>Message Details:</h3>
          <p style="white-space: pre-wrap; background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #e2e8f0;">{message}</p>
          
          <div class="reason-box">
            <strong>Action Required:</strong><br>
            Please reply directly to <strong>{user_email}</strong> to schedule their session.
          </div>
        """
        
        msg_admin = MIMEMultipart("alternative")
        msg_admin['From'] = smtp_email
        msg_admin['To'] = smtp_email  # Sending to admin
        msg_admin['Subject'] = f"🚨 New Premium Service Request: {service_type}"
        
        part_admin = MIMEText(base_html.format(content=admin_content), "html")
        msg_admin.attach(part_admin)

        # 2. Send Confirmation to User
        user_content = f"""
          <h2 class="greeting">Hello {user_name},</h2>
          <p>Thank you for reaching out to SPETRO Systems. We have successfully received your request for our <strong>{service_type}</strong> premium service.</p>
          
          <p>Our expert team will review your requirements and get back to you shortly at <strong>{user_email}</strong> to discuss the next steps and schedule a consultation.</p>
          
          <h3>Your Request Summary:</h3>
          <p style="white-space: pre-wrap; background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #e2e8f0; color: #64748b;">{message}</p>
          
          <p>We look forward to collaborating with you to deliver advanced spatial intelligence solutions.</p>
          <p>Best regards,<br><strong>The SPETRO Team</strong></p>
          
          <div class="reason-box">
            <strong>Why are you receiving this?</strong><br>
            You are receiving this email because you submitted a service request via the SPETRO Geo-Analysis platform. If you did not make this request, please contact us immediately.
          </div>
        """

        msg_user = MIMEMultipart("alternative")
        msg_user['From'] = smtp_email
        msg_user['To'] = user_email
        msg_user['Subject'] = f"We received your request: {service_type}"
        
        part_user = MIMEText(base_html.format(content=user_content), "html")
        msg_user.attach(part_user)

        # Connect and send both
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.login(smtp_email, smtp_password)
            server.send_message(msg_admin)
            server.send_message(msg_user)
            
        print(f"Successfully sent email alert and confirmation for service: {service_type}")
    except Exception as e:
        print(f"Error sending email alert/confirmation: {e}")

def send_new_course_alert(users: list[dict], course_title: str, course_desc: str):
    smtp_email = os.environ.get("SMTP_EMAIL")
    smtp_password = os.environ.get("SMTP_PASSWORD")

    if not smtp_email or not smtp_password:
        print("Warning: SMTP_EMAIL or SMTP_PASSWORD not set. Cannot send new course alert.")
        return

    # Base HTML Template
    base_html = """
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
        .footer {{ background-color: #f8fafc; padding: 25px 30px; text-align: center; border-top: 1px solid #e2e8f0; }}
        .footer p {{ margin: 0; font-size: 13px; color: #64748b; }}
        .reason-box {{ background-color: #f1f5f9; padding: 15px; border-radius: 8px; font-size: 13px; margin-top: 25px; color: #475569; }}
        .highlight-box {{ background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px; }}
        .btn {{ display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 10px; }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 class="logo">SPETRO</h1>
          <div class="logo-sub">Geo Analysis & Integrated Portal Solutions</div>
        </div>
        <div class="content">
          {content}
        </div>
        <div class="footer">
          <p>&copy; 2026 SPETRO Systems. All rights reserved.</p>
          <p>Advanced Spatial Intelligence & Environmental Modeling</p>
        </div>
      </div>
    </body>
    </html>
    """

    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.login(smtp_email, smtp_password)
            for user in users:
                user_email = user['email']
                user_name = user['name']

                user_content = f"""
                  <h2 class="greeting">Hello {user_name},</h2>
                  <p>We are excited to announce that a new course has just been added to the SPETRO Academy!</p>
                  
                  <div class="highlight-box">
                    <strong>Course Title:</strong> {course_title}<br>
                  </div>
                  
                  <p style="white-space: pre-wrap; color: #475569;">{course_desc}</p>
                  
                  <p>Visit the Academy today to start learning and expand your spatial intelligence skills.</p>
                  <a href="https://spetro.rw/academy" class="btn">View New Course</a>
                  
                  <p style="margin-top: 30px;">Best regards,<br><strong>The SPETRO Team</strong></p>
                  
                  <div class="reason-box">
                    <strong>Why are you receiving this?</strong><br>
                    You are receiving this email because you are a registered member of the SPETRO platform. We notify our community whenever new educational resources are available.
                  </div>
                """

                msg = MIMEMultipart("alternative")
                msg['From'] = smtp_email
                msg['To'] = user_email
                msg['Subject'] = f"🎓 New Course Available: {course_title}"
                
                part = MIMEText(base_html.format(content=user_content), "html")
                msg.attach(part)
                
                server.send_message(msg)

        print(f"Successfully sent new course alerts to {len(users)} users.")
    except Exception as e:
        print(f"Error sending new course alerts: {e}")
