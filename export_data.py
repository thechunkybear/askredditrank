import sqlite3
import json
from typing import List, Dict, Any

def export_questions_with_top_answers(db_path: str = 'askreddit.db', output_path: str = 'questions_with_answers.json') -> None:
    """
    Export questions with their top 10 answers to JSON format
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get all questions
    cursor.execute("""
        SELECT id, text, votes, timestamp, datetime 
        FROM questions 
        ORDER BY votes DESC
    """)
    
    questions = cursor.fetchall()
    result = []
    
    print(f"Processing {len(questions)} questions...")
    
    for i, (q_id, q_text, q_votes, q_timestamp, q_datetime) in enumerate(questions):
        if i % 1000 == 0:
            print(f"Processed {i}/{len(questions)} questions...")
        
        # Get top 10 answers for this question
        cursor.execute("""
            SELECT text, votes 
            FROM answers 
            WHERE q_id = ? 
            ORDER BY votes DESC 
            LIMIT 10
        """, (q_id,))
        
        answers = cursor.fetchall()
        
        # Format the data
        question_data = {
            'id': q_id,
            'text': q_text,
            'votes': q_votes,
            'timestamp': q_timestamp,
            'datetime': q_datetime,
            'top_answers': [
                {
                    'text': answer_text,
                    'votes': answer_votes
                }
                for answer_text, answer_votes in answers
            ]
        }
        
        result.append(question_data)
    
    conn.close()
    
    # Export to JSON
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    
    print(f"Exported {len(result)} questions with their top answers to {output_path}")
    print(f"Total answers exported: {sum(len(q['top_answers']) for q in result)}")

if __name__ == "__main__":
    export_questions_with_top_answers()
