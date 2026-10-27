#!/usr/bin/env python3
"""Knot MVP Database Initializer

初始化 SQLite 数据库，应用 schema v1.0。
"""

import sqlite3
import sys
from pathlib import Path
from datetime import datetime

def init_database(db_path: str) -> bool:
    """初始化数据库
    
    Args:
        db_path: 数据库文件路径
        
    Returns:
        True if success, False otherwise
    """
    db_file = Path(db_path)
    
    # 检查是否已存在
    if db_file.exists():
        print(f"⚠️  数据库已存在: {db_path}")
        response = input("是否覆盖？(y/N): ")
        if response.lower() != 'y':
            print("❌ 取消初始化")
            return False
        db_file.unlink()
        print(f"🗑️  已删除旧数据库")
    
    # 确保父目录存在
    db_file.parent.mkdir(parents=True, exist_ok=True)
    
    # 读取 schema
    schema_path = Path(__file__).parent / "schema_v1.sql"
    if not schema_path.exists():
        print(f"❌ Schema 文件不存在: {schema_path}")
        return False
    
    schema_sql = schema_path.read_text(encoding='utf-8')
    
    # 执行初始化
    try:
        conn = sqlite3.connect(db_path)
        conn.executescript(schema_sql)
        conn.commit()
        
        # 验证
        cursor = conn.cursor()
        cursor.execute("SELECT version, applied_at, description FROM schema_version")
        row = cursor.fetchone()
        
        if row:
            version, applied_at, desc = row
            applied_time = datetime.fromtimestamp(applied_at / 1000)
            print(f"✅ 数据库初始化成功")
            print(f"   版本: {version}")
            print(f"   时间: {applied_time}")
            print(f"   说明: {desc}")
            
            # 统计表
            cursor.execute("""
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
                ORDER BY name
            """)
            tables = [row[0] for row in cursor.fetchall()]
            print(f"   表数: {len(tables)}")
            for table in tables:
                print(f"      - {table}")
            
            conn.close()
            return True
        else:
            print("❌ 验证失败：未找到 schema_version 记录")
            conn.close()
            return False
            
    except sqlite3.Error as e:
        print(f"❌ 数据库错误: {e}")
        return False
    except Exception as e:
        print(f"❌ 未知错误: {e}")
        return False


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python init_db.py <数据库路径>")
        print("示例: python init_db.py ~/.knot/knot.db")
        sys.exit(1)
    
    db_path = sys.argv[1]
    success = init_database(db_path)
    sys.exit(0 if success else 1)
