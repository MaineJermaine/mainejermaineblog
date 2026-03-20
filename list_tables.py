import sqlite3
import os

if not os.path.exists('blog.db'):
    print("ERROR: blog.db not found!")
    exit()

conn = sqlite3.connect('blog.db')
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [row[0] for row in cursor.fetchall()]
conn.close()

print(f"Tables: {tables}")
