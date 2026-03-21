import os
import json
import smtplib
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime
from flask import Flask, request, jsonify, render_template, session, redirect, url_for, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'fjr1300A15')
from datetime import datetime, timedelta

# Config
MAIL_USER = os.environ.get('MAIL_USER', '')   
MAIL_PASS = os.environ.get('MAIL_PASS', '')   
BLOG_URL  = os.environ.get('BLOG_URL', 'http://localhost:5000')  

db_url = os.environ.get('DATABASE_URL')
if db_url and db_url.startswith('postgres://'):
    db_url = db_url.replace('postgres://', 'postgresql://', 1)

if os.environ.get('RENDER'):
    app.config['UPLOAD_FOLDER'] = '/data/uploads'
else:
    app.config['UPLOAD_FOLDER'] = 'static/uploads'

# Utility: Get standard UTC time (frontend handles local conversion)
def get_utc_time():
    return datetime.utcnow()

if db_url:
    app.config['SQLALCHEMY_DATABASE_URI'] = db_url
elif os.environ.get('RENDER'):
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:////data/blog.db'
else:
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///blog.db'

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024 # 50 MB max limit

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Helper route for serving uploaded files seamlessly whether local or on Render
@app.route('/uploads/<path:filename>')
def serve_uploads(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/static/uploads/<path:filename>')
def serve_legacy_uploads(filename):
    # Backwards compatibility for existing local files
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

db = SQLAlchemy(app)

class Post(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=True)
    content = db.Column(db.Text, nullable=False)
    folder = db.Column(db.String(100), default="main")  # category like poetry, art
    tags = db.Column(db.String(200), default="")
    links = db.Column(db.Text, default="[]") # JSON list of links
    likes = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=get_utc_time)
    username = db.Column(db.String(50), default="Owner")
    profile_pic = db.Column(db.String(200), default="/static/default_pic.jpg")
    media = db.Column(db.Text, default="[]") # JSON list of file info dicts
    is_private = db.Column(db.Boolean, default=False)  # private = owner-only
    comments = db.relationship('Comment', backref='post', cascade="all, delete-orphan", lazy=True)

class Comment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey('post.id'), nullable=False)
    author = db.Column(db.String(100), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=get_utc_time)

class Profile(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), default="Owner")
    bio = db.Column(db.Text, default="Welcome to my edgy blog!")
    profile_pic = db.Column(db.String(200), default="/static/default_pic.jpg")
    favicon_url = db.Column(db.String(200), default="/static/default_pic.jpg")
    links = db.Column(db.Text, default="[]") # JSON list of objects
    collections = db.Column(db.Text, default='["Main", "Poetry", "Art", "Ramblings"]')
    bg_type = db.Column(db.String(20), default="preset")
    bg_val = db.Column(db.String(200), default="default")
    spotify_url = db.Column(db.String(500), default="https://6klabs.com/widget/spotify/2d91be678271834a3584d5f6aa0b94a2d038c1fda8079f60fc2e9705dc752a20")

class Subscriber(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(150), unique=True, nullable=False)
    is_silenced = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=get_utc_time)

class Obsession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(100), nullable=False)
    content = db.Column(db.String(255), nullable=False)
    image_url = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=get_utc_time)

class ReadingItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    cover_image = db.Column(db.String(200))
    description = db.Column(db.Text)
    app_used = db.Column(db.String(100))
    link = db.Column(db.String(500))
    created_at = db.Column(db.DateTime, default=get_utc_time)

class ForumPost(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    media = db.Column(db.Text, default="[]") # JSON list of media
    likes = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=get_utc_time)
    comments = db.relationship('ForumComment', backref='forum_post', lazy=True, cascade="all, delete-orphan")

class ForumComment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey('forum_post.id'), nullable=False)
    author = db.Column(db.String(100), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=get_utc_time)

class SongOfWeek(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    spotify_url = db.Column(db.String(500), nullable=False)
    description = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=get_utc_time)

with app.app_context():
    # --- Lightweight column migrations ---
    # db.create_all() won't add new columns to existing tables.
    # We use raw SQL to add any missing columns safely.
    from sqlalchemy import text
    with db.engine.connect() as conn:
        # Check and add Profile.spotify_url if missing
        try:
            conn.execute(text("ALTER TABLE profile ADD COLUMN spotify_url VARCHAR(500)"))
            conn.commit()
        except Exception:
            pass
        # Check and add Profile.favicon_url if missing
        try:
            conn.execute(text("ALTER TABLE profile ADD COLUMN favicon_url VARCHAR(200)"))
            conn.commit()
        except Exception:
            pass
        # Check and add Subscriber.is_silenced if missing
        try:
            conn.execute(text("ALTER TABLE subscriber ADD COLUMN is_silenced BOOLEAN DEFAULT 0"))
            conn.commit()
        except Exception:
            pass
        # Check and add Post.is_private if missing
        try:
            conn.execute(text("ALTER TABLE post ADD COLUMN is_private BOOLEAN DEFAULT 0"))
            conn.commit()
        except Exception:
            pass
        # Create SongOfWeek table if not exists (db.create_all is fine for new tables)
        db.create_all()
        if not Profile.query.get(1):
            db.session.add(Profile(id=1))
            db.session.commit()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    password = data.get('password')
    # Default simple password for the owner
    if password == 'fjr1300A15':
        session['is_owner'] = True
        return jsonify({"success": True, "message": "Logged in"})
    return jsonify({"success": False, "message": "Invalid password"}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('is_owner', None)
    return jsonify({"success": True})

@app.route('/api/status', methods=['GET'])
def status():
    profile = Profile.query.get(1)
    posts_count = Post.query.filter((Post.is_private == False) | (Post.is_private.is_(None))).count() if not session.get('is_owner') else Post.query.count()
    return jsonify({
        "is_owner": session.get('is_owner', False),
        "username": profile.username,
        "profile_pic": profile.profile_pic,
        "favicon_url": profile.favicon_url,
        "bio": profile.bio,
        "links": json.loads(profile.links),
        "collections": json.loads(profile.collections),
        "bg_type": profile.bg_type,
        "bg_val": profile.bg_val,
        "spotify_url": profile.spotify_url,
        "posts_count": posts_count
    })

@app.route('/api/profile', methods=['PUT'])
def update_profile():
    if not session.get('is_owner'):
        return jsonify({"error": "Unauthorized"}), 403
    
    profile = Profile.query.get(1)
    
    # Handle optional file upload for profile pic
    file = request.files.get('profile_pic')
    if file and file.filename:
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)
        profile.profile_pic = "/uploads/" + filename
        
    # Form fields
    if 'username' in request.form:
        profile.username = request.form['username']
    if 'bio' in request.form:
        profile.bio = request.form['bio']
    if 'links' in request.form:
        profile.links = request.form['links']
    if 'collections' in request.form:
        profile.collections = request.form['collections']
    if 'bg_type' in request.form:
        profile.bg_type = request.form['bg_type']
    if 'bg_val' in request.form:
        # text based bg fallback
        profile.bg_val = request.form['bg_val']
        
    bg_file = request.files.get('bg_file')
    if bg_file and bg_file.filename:
        filename = "bg_" + str(int(datetime.now().timestamp())) + "_" + secure_filename(bg_file.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        bg_file.save(file_path)
        profile.bg_val = "/uploads/" + filename

    # Handle Favicon
    fav_file = request.files.get('favicon')
    if fav_file and fav_file.filename:
        filename = "fav_" + str(int(datetime.now().timestamp())) + "_" + secure_filename(fav_file.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        fav_file.save(file_path)
        profile.favicon_url = "/uploads/" + filename

    if 'spotify_url' in request.form:
        url = request.form['spotify_url']
        if 'src="' in url:
            import re
            m = re.search(r'src="([^"]+)"', url)
            if m: url = m.group(1)
        profile.spotify_url = url
        
    db.session.commit()
    return jsonify({"success": True})

@app.route('/api/subscribers', methods=['GET'])
def list_subscribers():
    if not session.get('is_owner'): return jsonify({"error": "Unauthorized"}), 403
    subs = Subscriber.query.order_by(Subscriber.created_at.desc()).all()
    return jsonify([{"id": s.id, "email": s.email, "is_silenced": s.is_silenced, "created_at": s.created_at.isoformat() if s.created_at else ''} for s in subs])

@app.route('/api/subscribers/<int:id>', methods=['DELETE'])
def delete_subscriber(id):
    if not session.get('is_owner'): return jsonify({"error": "Unauthorized"}), 403
    s = Subscriber.query.get_or_404(id)
    db.session.delete(s)
    db.session.commit()
    return jsonify({"success": True})

@app.route('/api/subscribers/<int:id>/toggle-silence', methods=['POST'])
def toggle_silence(id):
    if not session.get('is_owner'): return jsonify({"error": "Unauthorized"}), 403
    s = Subscriber.query.get_or_404(id)
    s.is_silenced = not s.is_silenced
    db.session.commit()
    return jsonify({"success": True, "is_silenced": s.is_silenced})

@app.route('/api/posts', methods=['GET', 'POST'])
def handle_posts():
    if request.method == 'GET':
        folder_filter = request.args.get('folder')
        page     = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 5))
        query = Post.query
        if folder_filter:
            query = query.filter_by(folder=folder_filter)
        # Hide private posts from non-owners
        if not session.get('is_owner'):
            query = query.filter_by(is_private=False)
        total = query.count()
        posts = query.order_by(Post.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
        
        profile = Profile.query.get(1)
        results = []
        for p in posts:
            results.append({
                "id": p.id,
                "title": p.title,
                "content": p.content,
                "folder": p.folder,
                "tags": p.tags,
                "likes": p.likes,
                "created_at": p.created_at.isoformat(),
                "username": profile.username,
                "profile_pic": profile.profile_pic,
                "media": json.loads(p.media),
                "links": json.loads(p.links) if hasattr(p, 'links') and p.links else [],
                "is_private": p.is_private,
                "comments": [{"id": c.id, "author": c.author, "content": c.content, "created_at": c.created_at.isoformat()} for c in p.comments]
            })
        return jsonify({"posts": results, "total": total, "page": page, "per_page": per_page, "has_more": (page * per_page) < total})
    
    # POST
    if not session.get('is_owner'):
        return jsonify({"error": "Unauthorized"}), 403
    
    title = request.form.get('title', '')
    content = request.form.get('content', '')
    folder = request.form.get('folder', 'main')
    tags = request.form.get('tags', '')
    links_data = request.form.get('links', '[]')
    is_private = request.form.get('is_private', 'false').lower() == 'true'
    
    files = request.files.getlist('media')
    media_data = []
    
    for file in files:
        if file and file.filename:
            filename = secure_filename(file.filename)
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(file_path)
            # Determine type
            file_ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
            media_type = 'file'
            if file_ext in ['mp4', 'webm', 'ogg']:
                media_type = 'video'
            elif file_ext in ['mp3', 'wav', 'ogg']:
                media_type = 'audio'
            elif file_ext in ['jpg', 'jpeg', 'png', 'gif']:
                media_type = 'image'
            
            media_data.append({"url": "/uploads/" + filename, "type": media_type})
            
    new_post = Post(
        title=title,
        content=content,
        folder=folder,
        tags=tags,
        links=links_data,
        media=json.dumps(media_data),
        is_private=is_private
    )
    db.session.add(new_post)
    db.session.commit()
    # Notify subscribers via real email (only for public posts AND if notify toggled)
    notify_followers = request.form.get('notify_followers') == 'true'
    
    if not is_private and notify_followers:
        if MAIL_USER and MAIL_PASS:
            subscribers = Subscriber.query.all()
            subscriber_emails = [s.email for s in subscribers]
            if subscriber_emails:
                post_title   = title or "New Post"
                post_snippet = (content[:200] + '...') if len(content) > 200 else content
                
                threading.Thread(
                    target=send_notification_emails,
                    args=(subscriber_emails, post_title, post_snippet),
                    daemon=True
                ).start()
        else:
            # Fallback for local testing log
            subscribers = Subscriber.query.all()
            for sub in subscribers:
                print(f"[EMAIL NOT CONFIGURED] Would notify: {sub.email}")
    
    return jsonify({"success": True, "post_id": new_post.id})


def send_notification_emails(recipient_emails, post_title, post_snippet):
    """Sends notification emails to all subscribers via Gmail SMTP."""
    subject = f"✨ jermaine just posted: {post_title}"
    
    for email in recipient_emails:
        try:
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From']    = MAIL_USER
            msg['To']      = email
            
            # Plain text fallback
            text_body = (
                f"Hey! jermaine just made a new post.\n\n"
                f"Title: {post_title}\n\n"
                f"{post_snippet}\n\n"
                f"Read it here: {BLOG_URL}\n\n"
                f"-- You're receiving this because you followed the blog."
            )
            
            # Nice HTML version
            html_body = f"""
            <html><body style="font-family:sans-serif; background:#0d0b14; color:#e0e0e0; padding:30px;">
                <div style="max-width:520px; margin:0 auto; background:#14100f; border:1px solid #ff2a6d55;
                            border-radius:10px; padding:30px;">
                    <h1 style="color:#05d9e8; font-size:1.4rem; margin-bottom:5px;">✨ new post alert</h1>
                    <h2 style="color:#ff2a6d; margin-top:0;">{post_title}</h2>
                    <p style="color:#bbb; line-height:1.6;">{post_snippet}</p>
                    <a href="{BLOG_URL}" style="display:inline-block; margin-top:20px;
                       background:linear-gradient(45deg,#ff2a6d,#05d9e8); color:#fff;
                       padding:12px 24px; border-radius:5px; text-decoration:none;
                       font-weight:bold;">Read the full post →</a>
                    <p style="margin-top:30px; font-size:0.75rem; color:#555;">
                        You're receiving this because you followed jermaine's blog.
                    </p>
                </div>
            </body></html>
            """
            
            msg.attach(MIMEText(text_body, 'plain'))
            msg.attach(MIMEText(html_body, 'html'))
            
            with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
                server.login(MAIL_USER, MAIL_PASS)
                server.sendmail(MAIL_USER, email, msg.as_string())
                
            print(f"[EMAIL] Sent to {email}")
        except Exception as e:
            print(f"[EMAIL ERROR] Failed to send to {email}: {e}")

@app.route('/api/posts/<int:post_id>', methods=['PUT', 'DELETE'])
def post_detail(post_id):
    if not session.get('is_owner'):
        return jsonify({"error": "Unauthorized"}), 403
        
    post = Post.query.get_or_404(post_id)
    
    if request.method == 'DELETE':
        db.session.delete(post)
        db.session.commit()
        return jsonify({"success": True})
        
    if request.method == 'PUT':
        # Detect content type
        if request.is_json:
            data = request.json
        else:
            data = request.form
            
        if 'title' in data:
            post.title = data['title']
        if 'content' in data:
            post.content = data['content']
        if 'folder' in data:
            post.folder = data['folder']
        if 'tags' in data:
            post.tags = data['tags']
        if 'links' in data:
            # links column is Text (JSON string) - always store as JSON string
            links_raw = data['links']
            if isinstance(links_raw, list):
                # Already a Python list (came from JSON body)
                post.links = json.dumps(links_raw)
            else:
                # It's a string - validate it's valid JSON, then store as-is
                try:
                    parsed = json.loads(links_raw)
                    post.links = json.dumps(parsed)  # normalise
                except (ValueError, TypeError):
                    post.links = '[]'
            
        if 'is_private' in data:
            # Form sends string 'true'/'false', JSON sends bool
            val = data['is_private']
            post.is_private = val if isinstance(val, bool) else val.lower() == 'true'

        # Handle New Media in Edit
        new_files = request.files.getlist('media')
        if new_files:
            try:
                media_list = json.loads(post.media) if post.media else []
                if not isinstance(media_list, list):
                    media_list = []
            except (ValueError, TypeError):
                media_list = []
            for file in new_files:
                if file and file.filename:
                    filename = secure_filename(file.filename)
                    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                    file.save(file_path)
                    
                    file_ext = filename.split('.')[-1].lower()
                    media_type = 'other'
                    if file_ext in ['mp4', 'webm', 'ogg']:
                        media_type = 'video'
                    elif file_ext in ['mp3', 'wav']:
                        media_type = 'audio'
                    elif file_ext in ['jpg', 'jpeg', 'png', 'gif']:
                        media_type = 'image'
                    
                    media_list.append({"url": "/uploads/" + filename, "type": media_type})
            post.media = json.dumps(media_list)

        db.session.commit()
        return jsonify({"success": True})

@app.route('/api/posts/<int:post_id>/like', methods=['POST', 'DELETE'])
def like_post(post_id):
    post = Post.query.get_or_404(post_id)
    if request.method == 'POST':
        post.likes += 1
    elif request.method == 'DELETE':
        post.likes = max(0, post.likes - 1)
    
    db.session.commit()
    return jsonify({"success": True, "likes": post.likes})

@app.route('/api/posts/<int:post_id>/comments', methods=['POST'])
def add_comment(post_id):
    post = Post.query.get_or_404(post_id)
    data = request.json
    author = data.get('author', 'Anonymous')
    content = data.get('content', '')
    
    if not content.strip():
        return jsonify({"error": "Content required"}), 400
        
    new_comment = Comment(post_id=post.id, author=author, content=content)
    db.session.add(new_comment)
    db.session.commit()
    
    return jsonify({"success": True, "comment_id": new_comment.id, "author": author, "content": content, "created_at": new_comment.created_at.isoformat()})

@app.route('/api/comments/<int:comment_id>', methods=['DELETE'])
def delete_comment(comment_id):
    if not session.get('is_owner'):
        return jsonify({"error": "Unauthorized"}), 403
    comment = Comment.query.get_or_404(comment_id)
    db.session.delete(comment)
    db.session.commit()
    return jsonify({"success": True})

@app.route('/api/subscribe', methods=['POST'])
def subscribe():
    data = request.json or {}
    email = data.get('email', '').strip()
    if not email or '@' not in email:
        return jsonify({"success": False, "error": "Invalid email format"}), 400
        
    existing = Subscriber.query.filter_by(email=email).first()
    if existing:
        return jsonify({"success": True, "message": "Already subscribed"})
        
    s = Subscriber(email=email)
    db.session.add(s)
    db.session.commit()
    return jsonify({"success": True})

@app.route('/api/obsessions', methods=['GET', 'POST'])
def handle_obsessions():
    if request.method == 'GET':
        obs = Obsession.query.order_by(Obsession.created_at.desc()).all()
        return jsonify([{"id": o.id, "category": o.category, "content": o.content, "image_url": o.image_url} for o in obs])
        
    if not session.get('is_owner'):
        return jsonify({"error": "Unauthorized"}), 403
        
    category = request.form.get('category')
    content = request.form.get('content')
    
    image_url = ''
    file = request.files.get('image')
    if file and file.filename:
        filename = "obs_" + secure_filename(file.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)
        image_url = "/uploads/" + filename
        
    new_obs = Obsession(category=category, content=content, image_url=image_url)
    db.session.add(new_obs)
    db.session.commit()
    return jsonify({"success": True})

@app.route('/api/obsessions/<int:o_id>', methods=['DELETE', 'PUT'])
def delete_obsession(o_id):
    if not session.get('is_owner'):
        return jsonify({"error": "Unauthorized"}), 403
    ob = Obsession.query.get_or_404(o_id)
    
    if request.method == 'DELETE':
        db.session.delete(ob)
        db.session.commit()
        return jsonify({"success": True})
    
    if request.method == 'PUT':
        if 'category' in request.form:
            ob.category = request.form['category']
        if 'content' in request.form:
            ob.content = request.form['content']
        file = request.files.get('image')
        if file and file.filename:
            filename = "obs_" + secure_filename(file.filename)
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(file_path)
            ob.image_url = "/uploads/" + filename
        db.session.commit()
        return jsonify({"success": True})

@app.route('/api/reading', methods=['GET', 'POST'])
def handle_reading():
    if request.method == 'GET':
        items = ReadingItem.query.order_by(ReadingItem.created_at.desc()).all()
        return jsonify([{
            "id": r.id, "title": r.title, "cover_image": r.cover_image,
            "description": r.description, "app_used": r.app_used, "link": r.link
        } for r in items])
        
    if not session.get('is_owner'):
        return jsonify({"error": "Unauthorized"}), 403
        
    title = request.form.get('title')
    description = request.form.get('description', '')
    app_used = request.form.get('app_used', '')
    link = request.form.get('link', '')
    
    cover_image = ''
    file = request.files.get('cover_image')
    if file and file.filename:
        filename = "read_" + secure_filename(file.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)
        cover_image = "/uploads/" + filename
        
    new_item = ReadingItem(title=title, description=description, app_used=app_used, link=link, cover_image=cover_image)
    db.session.add(new_item)
    db.session.commit()
    return jsonify({"success": True})

@app.route('/api/reading/<int:r_id>', methods=['DELETE', 'PUT'])
def delete_reading(r_id):
    if not session.get('is_owner'):
        return jsonify({"error": "Unauthorized"}), 403
    item = ReadingItem.query.get_or_404(r_id)
    
    if request.method == 'DELETE':
        db.session.delete(item)
        db.session.commit()
        return jsonify({"success": True})
    
    if request.method == 'PUT':
        title = request.form.get('title')
        description = request.form.get('description')
        app_used = request.form.get('app_used')
        link = request.form.get('link')
        if title:
            item.title = title
        if description is not None:
            item.description = description
        if app_used is not None:
            item.app_used = app_used
        if link is not None:
            item.link = link
        file = request.files.get('cover_image')
        if file and file.filename:
            filename = "read_" + secure_filename(file.filename)
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(file_path)
            item.cover_image = "/uploads/" + filename
        db.session.commit()
        return jsonify({"success": True})

@app.route('/api/song-of-week', methods=['GET', 'POST'])
def handle_song_of_week():
    if request.method == 'GET':
        # Get the latest one
        song = SongOfWeek.query.order_by(SongOfWeek.created_at.desc()).first()
        if not song:
            return jsonify(None)
        return jsonify({
            "id": song.id,
            "spotify_url": song.spotify_url,
            "description": song.description
        })
    
    if not session.get('is_owner'):
        return jsonify({"error": "Unauthorized"}), 403
        
    data = request.json
    new_song = SongOfWeek(
        spotify_url=data.get('spotify_url', ''),
        description=data.get('description', '')
    )
    db.session.add(new_song)
    db.session.commit()
    return jsonify({"success": True})

@app.route('/api/song-of-week/<int:s_id>', methods=['PUT', 'DELETE'])
def song_of_week_detail(s_id):
    if not session.get('is_owner'):
        return jsonify({"error": "Unauthorized"}), 403
        
    song = SongOfWeek.query.get_or_404(s_id)
    
    if request.method == 'DELETE':
        db.session.delete(song)
        db.session.commit()
        return jsonify({"success": True})
        
    if request.method == 'PUT':
        data = request.json
        if 'spotify_url' in data:
            song.spotify_url = data['spotify_url']
        if 'description' in data:
            song.description = data['description']
        db.session.commit()
        return jsonify({"success": True})

# --- FORUM ROUTES ---
@app.route('/api/forum', methods=['GET', 'POST'])
def handle_forum():
    if request.method == 'GET':
        page     = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        
        query = ForumPost.query.order_by(ForumPost.created_at.desc())
        total = query.count()
        posts = query.offset((page - 1) * per_page).limit(per_page).all()
        
        results = []
        for p in posts:
            results.append({
                "id": p.id,
                "content": p.content,
                "media": json.loads(p.media),
                "likes": p.likes,
                "created_at": p.created_at.isoformat(),
                "comments": [{
                    "id": c.id, "author": c.author, "content": c.content, "created_at": c.created_at.isoformat()
                } for c in p.comments]
            })
        return jsonify({"posts": results, "has_more": total > (page * per_page)})

    if not session.get('is_owner'):
        return jsonify({"error": "Unauthorized"}), 403

    content = request.form.get('content', '')
    files = request.files.getlist('media')

    media_list = []
    for file in files:
        if file and file.filename:
            filename = "forum_" + str(int(datetime.now().timestamp())) + "_" + secure_filename(file.filename)
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(file_path)
            m_type = 'image'
            if file.content_type and file.content_type.startswith('video'):
                m_type = 'video'
            elif file.content_type and file.content_type.startswith('audio'):
                m_type = 'audio'
            media_list.append({"url": "/uploads/" + filename, "type": m_type})

    new_post = ForumPost(content=content, media=json.dumps(media_list))
    db.session.add(new_post)
    db.session.commit()
    return jsonify({"success": True})

@app.route('/api/forum/<int:p_id>/like', methods=['POST', 'DELETE'])
def like_forum_post(p_id):
    post = ForumPost.query.get_or_404(p_id)
    if request.method == 'POST':
        post.likes += 1
    elif request.method == 'DELETE':
        post.likes = max(0, post.likes - 1)
        
    db.session.commit()
    return jsonify({"success": True, "likes": post.likes})

@app.route('/api/forum/<int:p_id>/comments', methods=['POST'])
def post_forum_comment(p_id):
    post = ForumPost.query.get_or_404(p_id)
    data = request.json
    new_comment = ForumComment(
        post_id=p_id,
        author=data.get('author', 'Anonymous'),
        content=data.get('content', '')
    )
    db.session.add(new_comment)
    db.session.commit()
    return jsonify({
        "success": True, "id": new_comment.id, "author": new_comment.author,
        "content": new_comment.content, "created_at": new_comment.created_at.isoformat()
    })

@app.route('/api/forum/<int:p_id>', methods=['DELETE'])
def delete_forum_post(p_id):
    if not session.get('is_owner'):
        return jsonify({"error": "Unauthorized"}), 403
    post = ForumPost.query.get_or_404(p_id)
    db.session.delete(post)
    db.session.commit()
    return jsonify({"success": True})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
