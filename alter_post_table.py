import sqlite3
import os
from flask import Flask

app = Flask(__name__)
# Assuming the DB is in instance/blog.db based on Flask-SQLAlchemy default
db_path = os.path.join('instance', 'blog.db')
if not os.path.exists(db_path):
    print("Instance DB not found, trying current dir...")
    db_path = 'blog.db'

print("Using db path:", db_path)
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
try:
    cursor.execute("ALTER TABLE post ADD COLUMN links TEXT DEFAULT '[]'")
    conn.commit()
    print("Column added successfully!")
except Exception as e:
    print("Failed or already exists:", e)
conn.close()
