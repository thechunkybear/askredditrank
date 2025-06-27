import json
import time
from datetime import datetime
import re
from typing import List, Dict, Any
from playwright.sync_api import sync_playwright

def get_top_posts_this_year(limit: int = 1000) -> List[Dict[str, Any]]:
    """
    Get top posts from r/askreddit for this year using Playwright
    """
    posts_data = []
    current_year = datetime.now().year
    
    print(f"Fetching top {limit} posts from r/askreddit for {current_year}...")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # Set user agent to avoid detection
        page.set_extra_http_headers({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        })
        
        # Navigate to r/askreddit top posts of the year
        url = "https://old.reddit.com/r/AskReddit/top/?sort=top&t=year"
        page.goto(url)
        
        # Wait for content to load
        page.wait_for_selector('.thing', timeout=10000)
        
        posts_processed = 0
        page_num = 1
        
        while posts_processed < limit:
            print(f"Processing page {page_num}...")
            
            # Get all post elements on current page
            posts = page.query_selector_all('.thing')
            
            for post in posts:
                if posts_processed >= limit:
                    break
                    
                try:
                    # Extract post data
                    title_elem = post.query_selector('.title a.title')
                    if not title_elem:
                        continue
                        
                    title = title_elem.inner_text().strip()
                    post_url = title_elem.get_attribute('href')
                    
                    # Get author
                    author_elem = post.query_selector('.author')
                    author = author_elem.inner_text() if author_elem else '[deleted]'
                    
                    # Get score
                    score_elem = post.query_selector('.score.unvoted')
                    score_text = score_elem.inner_text() if score_elem else '0'
                    score = parse_score(score_text)
                    
                    # Get number of comments
                    comments_elem = post.query_selector('.comments')
                    comments_text = comments_elem.inner_text() if comments_elem else '0 comments'
                    num_comments = parse_comments_count(comments_text)
                    
                    # Get timestamp
                    time_elem = post.query_selector('time')
                    created_date = time_elem.get_attribute('datetime') if time_elem else None
                    
                    print(f"Processing post {posts_processed + 1}/{limit}: {title[:50]}...")
                    
                    # Get top comments by visiting the post
                    top_comments = get_top_comments(page, post_url)
                    
                    post_data = {
                        'title': title,
                        'author': author,
                        'score': score,
                        'num_comments': num_comments,
                        'created_date': created_date,
                        'url': post_url,
                        'top_comments': top_comments
                    }
                    
                    posts_data.append(post_data)
                    posts_processed += 1
                    
                    # Small delay between posts
                    time.sleep(0.5)
                    
                except Exception as e:
                    print(f"Error processing post: {e}")
                    continue
            
            # Try to go to next page
            next_button = page.query_selector('.next-button a')
            if next_button and posts_processed < limit:
                next_url = next_button.get_attribute('href')
                page.goto(next_url)
                page.wait_for_selector('.thing', timeout=10000)
                page_num += 1
                time.sleep(1)
            else:
                break
        
        browser.close()
    
    return posts_data

def get_top_comments(page, post_url: str) -> List[Dict[str, Any]]:
    """
    Get top 5 comments from a Reddit post
    """
    top_comments = []
    
    try:
        # Navigate to the post
        if not post_url.startswith('http'):
            post_url = f"https://old.reddit.com{post_url}"
        
        page.goto(post_url)
        page.wait_for_selector('.comment', timeout=5000)
        
        # Get top-level comments (not replies)
        comments = page.query_selector_all('.comment:not(.child)')[:5]
        
        for comment in comments:
            try:
                # Get comment author
                author_elem = comment.query_selector('.author')
                author = author_elem.inner_text() if author_elem else '[deleted]'
                
                # Get comment body
                body_elem = comment.query_selector('.usertext-body .md')
                body = body_elem.inner_text().strip() if body_elem else ''
                
                # Skip deleted/removed comments
                if body in ['[deleted]', '[removed]', '']:
                    continue
                
                # Get comment score
                score_elem = comment.query_selector('.score')
                score_text = score_elem.inner_text() if score_elem else '1'
                score = parse_score(score_text)
                
                top_comments.append({
                    'author': author,
                    'body': body,
                    'score': score
                })
                
            except Exception as e:
                print(f"Error processing comment: {e}")
                continue
    
    except Exception as e:
        print(f"Error getting comments for post: {e}")
    
    return top_comments

def parse_score(score_text: str) -> int:
    """
    Parse Reddit score text (handles k, m suffixes)
    """
    if not score_text or score_text == '•':
        return 0
    
    score_text = score_text.lower().replace(',', '')
    
    if 'k' in score_text:
        return int(float(score_text.replace('k', '')) * 1000)
    elif 'm' in score_text:
        return int(float(score_text.replace('m', '')) * 1000000)
    else:
        try:
            return int(score_text)
        except ValueError:
            return 0

def parse_comments_count(comments_text: str) -> int:
    """
    Parse comments count from text like "123 comments"
    """
    match = re.search(r'(\d+)', comments_text)
    return int(match.group(1)) if match else 0

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
        print("Starting Reddit scraper using Playwright...")
        
        # Scrape posts
        posts_data = get_top_posts_this_year(limit=1000)
        
        # Save to JSON
        save_to_json(posts_data)
        
        print("Scraping completed successfully!")
        
    except Exception as e:
        print(f"Error occurred: {str(e)}")
        print("\nMake sure you have installed Playwright and its browsers:")
        print("pip install playwright")
        print("playwright install")

if __name__ == "__main__":
    main()
