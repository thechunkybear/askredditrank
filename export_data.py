import sqlite3
import json
import random
import os
from datetime import datetime, timedelta
from typing import List, Dict, Any

def export_questions_with_top_answers(db_path: str = 'askreddit.db', start_date: str = '20250701') -> None:
    """
    Export questions with their top answers to daily JavaScript files, one question per day
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("Fetching all questions with their top 10 answers in one query...")
    
    # Get questions where the top answer has at least 5000 votes
    # and select 5 answers representing quintiles using proper quantile ranking
    cursor.execute("""
        WITH question_stats AS (
            SELECT 
                q_id,
                MAX(votes) as max_votes
            FROM answers
            GROUP BY q_id
            HAVING MAX(votes) >= 5000
        ),
        answers_with_quintiles AS (
            SELECT 
                a.q_id,
                a.text,
                a.votes,
                q.text as question_text,
                q.votes as question_votes,
                q.timestamp,
                q.datetime,
                NTILE(5) OVER (PARTITION BY a.q_id ORDER BY a.votes DESC) as quintile
            FROM answers a
            JOIN questions q ON a.q_id = q.id
            JOIN question_stats qs ON a.q_id = qs.q_id
            WHERE LENGTH(a.text) <= 100
        ),
        quintile_answers AS (
            SELECT 
                q_id,
                text,
                votes,
                question_text,
                question_votes,
                timestamp,
                datetime,
                quintile,
                ROW_NUMBER() OVER (PARTITION BY q_id, quintile ORDER BY votes DESC) as quintile_rank
            FROM answers_with_quintiles
        ),
        answers_with_ranks AS (
            SELECT 
                a.q_id,
                a.text,
                a.votes,
                q.text as question_text,
                q.votes as question_votes,
                q.timestamp,
                q.datetime,
                ROW_NUMBER() OVER (PARTITION BY a.q_id ORDER BY a.votes DESC) as rank_desc,
                ROW_NUMBER() OVER (PARTITION BY a.q_id ORDER BY a.votes ASC) as rank_asc
            FROM answers a
            JOIN questions q ON a.q_id = q.id
            JOIN question_stats qs ON a.q_id = qs.q_id
            WHERE LENGTH(a.text) <= 100
        ),
        top_bottom_answers AS (
            SELECT 
                q_id,
                text,
                votes,
                question_text,
                question_votes,
                timestamp,
                datetime,
                CASE 
                    WHEN rank_desc = 1 THEN 1
                    WHEN rank_asc = 1 THEN 5
                END as quintile
            FROM answers_with_ranks
            WHERE rank_desc = 1 OR rank_asc = 1
        ),
        all_selected_answers AS (
            SELECT q_id, text, votes, question_text, question_votes, timestamp, datetime, quintile
            FROM quintile_answers
            WHERE quintile_rank = 1 AND quintile IN (2, 3, 4)
            
            UNION ALL
            
            SELECT q_id, text, votes, question_text, question_votes, timestamp, datetime, quintile
            FROM top_bottom_answers
            WHERE quintile IS NOT NULL
        )
        SELECT 
            q_id as id,
            question_text as text,
            question_votes as votes,
            timestamp,
            datetime,
            text as answer_text,
            votes as answer_votes
        FROM all_selected_answers
        ORDER BY question_votes DESC, id, quintile
    """)
    
    rows = cursor.fetchall()
    conn.close()
    
    print(f"Processing {len(rows)} rows...")
    
    # Group results by question
    questions_dict = {}
    
    for row in rows:
        q_id, q_text, q_votes, q_timestamp, q_datetime, answer_text, answer_votes = row
        
        if q_id not in questions_dict:
            questions_dict[q_id] = {
                'id': q_id,
                'text': q_text,
                'votes': q_votes,
                'timestamp': q_timestamp,
                'datetime': q_datetime,
                'top_answers': []
            }
        
        # Add answer (should always exist with INNER JOIN)
        if answer_text is not None:
            questions_dict[q_id]['top_answers'].append({
                'text': answer_text,
                'votes': answer_votes
            })
    
    # Convert to list and shuffle randomly
    result = list(questions_dict.values())
    random.shuffle(result)
    
    # Parse start date
    start_date_obj = datetime.strptime(start_date, '%Y%m%d')
    
    # Create data directory if it doesn't exist
    os.makedirs('data', exist_ok=True)
    
    # Export one question per day starting from the specified date
    for i, question in enumerate(result):
        # Calculate the date for this question
        current_date = start_date_obj + timedelta(days=i)
        date_str = current_date.strftime('%Y%m%d')
        filename = f'data/{date_str}_data.js'
        
        # Convert to minified format (single question in array)
        answers_array = [[answer['text'], answer['votes']] for answer in question['top_answers']]
        minified_question = [
            question['id'],
            question['text'], 
            question['votes'],
            question['timestamp'],
            question['datetime'],
            answers_array
        ]
        minified_data = [minified_question]  # Single question in array
        
        # Export to JavaScript file
        with open(filename, 'w', encoding='utf-8') as f:
            f.write('// Reddit AskReddit question and answers data (minified)\n')
            f.write('// Format: [id, text, votes, timestamp, datetime, [[answer_text, votes], ...]]\n')
            f.write(f'// Generated by export_data.py for {date_str}\n\n')
            f.write('const redditData = ')
            json.dump(minified_data, f, separators=(',', ':'), ensure_ascii=False)
            f.write(';\n')
    
    print(f"Exported {len(result)} questions to daily files starting from {start_date}")
    print(f"Files created: {start_date}_data.js through {(start_date_obj + timedelta(days=len(result)-1)).strftime('%Y%m%d')}_data.js")
    print(f"Total answers exported: {sum(len(q['top_answers']) for q in result)}")

if __name__ == "__main__":
    export_questions_with_top_answers()
