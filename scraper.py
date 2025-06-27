import praw
import json
import time
from datetime import datetime, timedelta
import os
from typing import List, Dict, Any

def setup_reddit_client() -> praw.Reddit:
    """
    Setup Reddit API client using environment variables.
    You need to set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, and REDDIT_USER_AGENT
    """
    return praw.Reddit(
        client_id=os.getenv('REDDIT_CLIENT_ID'),
        client_secret=os.getenv('REDDIT_CLIENT_SECRET'),
        user_agent=os.getenv('REDDIT_USER_AGENT', 'AskReddit Scraper 1.0')
    )

def get_top_posts_this_year(reddit: praw.Reddit, limit: int = 1000) -> List[Dict[str, Any]]:
    """
    Get top posts from r/askreddit for this year
    """
    subreddit = reddit.subreddit('askreddit')
    posts_data = []
    
    # Get current year start timestamp
    current_year = datetime.now().year
    year_start = datetime(current_year, 1, 1)
    year_start_timestamp = year_start.timestamp()
    
    print(f"Fetching top {limit} posts from r/askreddit for {current_year}...")
    
    # Get top posts from this year
    posts = subreddit.top(time_filter='year', limit=limit)
    
    for i, post in enumerate(posts, 1):
        # Check if post is from this year
        post_date = datetime.fromtimestamp(post.created_utc)
        if post_date.timestamp() < year_start_timestamp:
            continue
            
        print(f"Processing post {i}/{limit}: {post.title[:50]}...")
        
        # Get top 5 comments
        post.comments.replace_more(limit=0)  # Remove "more comments" objects
        top_comments = []
        
        for comment in post.comments[:5]:
            if hasattr(comment, 'body') and comment.body != '[deleted]' and comment.body != '[removed]':
                top_comments.append({
                    'author': str(comment.author) if comment.author else '[deleted]',
                    'body': comment.body,
                    'score': comment.score,
                    'created_utc': comment.created_utc
                })
        
        post_data = {
            'title': post.title,
            'author': str(post.author) if post.author else '[deleted]',
            'score': post.score,
            'num_comments': post.num_comments,
            'created_utc': post.created_utc,
            'created_date': post_date.strftime('%Y-%m-%d %H:%M:%S'),
            'url': post.url,
            'selftext': post.selftext,
            'top_comments': top_comments
        }
        
        posts_data.append(post_data)
        
        # Add small delay to be respectful to Reddit's API
        time.sleep(0.1)
    
    return posts_data

def save_to_json(data: List[Dict[str, Any]], filename: str = 'askreddit_top_posts_2025.json'):
    """
    Save the scraped data to a JSON file
    """
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"Data saved to {filename}")
    print(f"Total posts scraped: {len(data)}")

def main():
    """
    Main function to run the scraper
    """
    try:
        # Setup Reddit client
        reddit = setup_reddit_client()
        
        # Test connection
        print("Testing Reddit API connection...")
        reddit.user.me()  # This will raise an exception if not authenticated
        print("Connected successfully!")
        
        # Scrape posts
        posts_data = get_top_posts_this_year(reddit, limit=1000)
        
        # Save to JSON
        save_to_json(posts_data)
        
        print("Scraping completed successfully!")
        
    except Exception as e:
        print(f"Error occurred: {str(e)}")
        print("\nMake sure you have set the following environment variables:")
        print("- REDDIT_CLIENT_ID")
        print("- REDDIT_CLIENT_SECRET")
        print("- REDDIT_USER_AGENT")
        print("\nYou can get these by creating a Reddit app at: https://www.reddit.com/prefs/apps")

if __name__ == "__main__":
    main()
