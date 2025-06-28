import sqlite3
import json
from typing import List, Dict, Any

def export_questions_with_top_answers(db_path: str = 'askreddit.db', output_path: str = 'data.js') -> None:
    """
    Export questions with their top 10 answers to JavaScript format
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
        top_bottom_answers AS (
            SELECT 
                a.q_id,
                a.text,
                a.votes,
                q.text as question_text,
                q.votes as question_votes,
                q.timestamp,
                q.datetime,
                CASE 
                    WHEN ROW_NUMBER() OVER (PARTITION BY a.q_id ORDER BY a.votes DESC) = 1 THEN 1
                    WHEN ROW_NUMBER() OVER (PARTITION BY a.q_id ORDER BY a.votes ASC) = 1 THEN 5
                END as quintile
            FROM answers a
            JOIN questions q ON a.q_id = q.id
            JOIN question_stats qs ON a.q_id = qs.q_id
            WHERE LENGTH(a.text) <= 100
            AND (ROW_NUMBER() OVER (PARTITION BY a.q_id ORDER BY a.votes DESC) = 1 
                 OR ROW_NUMBER() OVER (PARTITION BY a.q_id ORDER BY a.votes ASC) = 1)
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
    
    # Convert to list and maintain order by question votes
    result = list(questions_dict.values())
    
    # Convert to minified format
    minified_data = []
    for question in result:
        # Convert to compact array format: [id, text, votes, timestamp, datetime, [[answer_text, votes], ...]]
        answers_array = [[answer['text'], answer['votes']] for answer in question['top_answers']]
        minified_question = [
            question['id'],
            question['text'], 
            question['votes'],
            question['timestamp'],
            question['datetime'],
            answers_array
        ]
        minified_data.append(minified_question)
    
    # Export to JavaScript file with minified format
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('// Reddit AskReddit questions and answers data (minified)\n')
        f.write('// Format: [id, text, votes, timestamp, datetime, [[answer_text, votes], ...]]\n')
        f.write('// Generated by export_data.py\n\n')
        f.write('const redditData = ')
        json.dump(minified_data, f, separators=(',', ':'), ensure_ascii=False)
        f.write(';\n')
    
    print(f"Exported {len(result)} questions with quintile answers to {output_path}")
    print(f"Total answers exported: {sum(len(q['top_answers']) for q in result)}")

if __name__ == "__main__":
    export_questions_with_top_answers()
