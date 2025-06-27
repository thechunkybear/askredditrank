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
        browser = p.chromium.launch(headless=False)  # Run in non-headless mode for debugging
        page = browser.new_page()
        
        # Set user agent to avoid detection
        page.set_extra_http_headers({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        })
        
        # Step 1: Collect all post URLs first
        print("Step 1: Collecting post URLs...")
        post_urls = collect_post_urls(page, limit)
        
        # Step 2: Visit each post and extract comments
        print(f"Step 2: Extracting comments from {len(post_urls)} posts...")
        for i, post_info in enumerate(post_urls):
            if i >= limit:
                break
                
            try:
                print(f"Processing post {i+1}/{len(post_urls)}: {post_info['title'][:50]}...")
                
                # Get top comments by visiting the post
                top_comments = get_top_comments(page, post_info['url'])
                
                post_data = {
                    'title': post_info['title'],
                    'url': post_info['url'],
                    'top_comments': top_comments
                }
                
                posts_data.append(post_data)
                
                # Small delay between posts
                time.sleep(0.5)
                
            except Exception as e:
                print(f"Error processing post '{post_info['title'][:50]}': {e}")
                continue
        
        browser.close()
    
    return posts_data

def collect_post_urls(page, limit: int) -> List[Dict[str, str]]:
    """
    Collect post URLs and titles from multiple pages
    """
    post_urls = []
    
    # Navigate to r/askreddit top posts of the year
    url = "https://old.reddit.com/r/AskReddit/top/?sort=top&t=year"
    print(f"Navigating to: {url}")
    
    try:
        response = page.goto(url, wait_until='networkidle')
        print(f"Page loaded with status: {response.status}")
        print(f"Page URL after navigation: {page.url}")
        print(f"Page title: {page.title()}")
        
        # Take a screenshot for debugging
        page.screenshot(path="debug_page.png")
        print("Screenshot saved as debug_page.png")
        
        # Check if we're being redirected or blocked
        if "reddit.com" not in page.url:
            print(f"WARNING: Redirected away from Reddit to: {page.url}")
        
        # Try multiple selectors to see what's available
        selectors_to_try = ['.thing', '.Post', '[data-testid="post"]', '.entry', 'article']
        found_selector = None
        
        for selector in selectors_to_try:
            try:
                print(f"Trying selector: {selector}")
                elements = page.query_selector_all(selector)
                print(f"Found {len(elements)} elements with selector '{selector}'")
                if elements:
                    found_selector = selector
                    break
            except Exception as e:
                print(f"Error with selector '{selector}': {e}")
        
        if not found_selector:
            print("No post elements found with any selector. Checking page content...")
            page_content = page.content()
            print(f"Page content length: {len(page_content)}")
            
            # Save page content for debugging
            with open("debug_page.html", "w", encoding="utf-8") as f:
                f.write(page_content)
            print("Page content saved as debug_page.html")
            
            # Check for common Reddit elements
            if "reddit" in page_content.lower():
                print("Page contains 'reddit' text")
            if "askreddit" in page_content.lower():
                print("Page contains 'askreddit' text")
            if "top" in page_content.lower():
                print("Page contains 'top' text")
            
            raise Exception("Could not find any post elements on the page")
        
        print(f"Using selector: {found_selector}")
        
    except Exception as e:
        print(f"Error during page navigation or element detection: {e}")
        page.screenshot(path="error_page.png")
        print("Error screenshot saved as error_page.png")
        raise
    
    page_num = 1
    
    while len(post_urls) < limit:
        print(f"Collecting URLs from page {page_num}...")
        
        # Get all post elements on current page
        posts = page.query_selector_all(found_selector)
        print(f"Found {len(posts)} posts on page {page_num}")
        
        for post in posts:
            if len(post_urls) >= limit:
                break
                
            try:
                # Extract post title and URL
                title_elem = post.query_selector('.title a.title')
                if not title_elem:
                    title_elem = post.query_selector('.title a')
                
                if not title_elem:
                    print(f"Could not find title element in post {len(post_urls) + 1}")
                    continue
                    
                title = title_elem.inner_text().strip()
                post_url = title_elem.get_attribute('href')
                
                if not title or not post_url:
                    print(f"Empty title or URL found in post {len(post_urls) + 1}")
                    continue
                
                # Skip ads and external links
                if post_url.startswith('https://alb.reddit.com/') or post_url.startswith('http://alb.reddit.com/'):
                    print(f"Skipping ad: {title[:50]}...")
                    continue
                
                # Skip other external links that aren't Reddit posts
                if post_url.startswith('http') and 'reddit.com' not in post_url:
                    print(f"Skipping external link: {title[:50]}...")
                    continue
                
                # Make sure URL is absolute
                if not post_url.startswith('http'):
                    post_url = f"https://old.reddit.com{post_url}"
                
                # Additional check for Reddit post URLs
                if '/comments/' not in post_url:
                    print(f"Skipping non-post URL: {title[:50]}...")
                    continue
                
                post_urls.append({
                    'title': title,
                    'url': post_url
                })
                
                print(f"Collected post {len(post_urls)}: {title[:50]}...")
                
            except Exception as e:
                print(f"Error collecting post {len(post_urls) + 1}: {e}")
                continue
        
        # Try to go to next page
        if len(post_urls) < limit:
            next_button = page.query_selector('.next-button a')
            if next_button:
                next_url = next_button.get_attribute('href')
                print(f"Navigating to next page: {next_url}")
                page.goto(next_url)
                
                # Wait for posts to load on next page
                try:
                    page.wait_for_selector(found_selector, timeout=10000)
                except Exception as e:
                    print(f"Timeout waiting for posts on page {page_num + 1}: {e}")
                    break
                
                page_num += 1
                time.sleep(1)
            else:
                print("No next button found")
                break
    
    print(f"Collected {len(post_urls)} post URLs total")
    return post_urls

def get_top_comments(page, post_url: str) -> List[Dict[str, Any]]:
    """
    Get top 5 comments from a Reddit post
    """
    top_comments = []
    
    try:
        # Navigate to the post
        if not post_url.startswith('http'):
            post_url = f"https://old.reddit.com{post_url}"
        
        print(f"  Getting comments from: {post_url}")
        page.goto(post_url)
        
        # Try multiple comment selectors
        comment_selectors = ['.comment', '[data-testid="comment"]', '.Comment']
        found_comments = False
        
        for comment_selector in comment_selectors:
            try:
                page.wait_for_selector(comment_selector, timeout=5000)
                found_comments = True
                break
            except:
                continue
        
        if not found_comments:
            print(f"  No comments found on post")
            return top_comments
        
        # Get top-level comments (not replies) - use more specific selector
        comments = page.query_selector_all('.comment:not(.child)')[:5]
        
        # If no top-level comments found, try alternative approach
        if not comments:
            all_comments = page.query_selector_all('.comment')
            # Filter for top-level comments by checking if they don't have a parent comment
            comments = []
            for comment in all_comments:
                # Check if this comment is nested inside another comment
                parent_comment = comment.query_selector('xpath=ancestor::div[contains(@class, "comment")]')
                if not parent_comment:
                    comments.append(comment)
                    if len(comments) >= 5:
                        break
        
        print(f"  Found {len(comments)} comments to process")
        
        for i, comment in enumerate(comments):
            try:
                print(f"    DEBUG: Processing comment {i+1}, element type: {type(comment)}")
                
                # Get comment body
                print(f"    DEBUG: Querying '.usertext-body .md' on comment element")
                body_elem = comment.query_selector('.usertext-body .md')
                if not body_elem:
                    print(f"    DEBUG: '.usertext-body .md' not found, trying '.usertext-body'")
                    body_elem = comment.query_selector('.usertext-body')
                
                if body_elem:
                    print(f"    DEBUG: Getting inner text from comment body element")
                    body = body_elem.inner_text().strip()
                else:
                    body = ''
                
                # Skip deleted/removed comments
                if body in ['[deleted]', '[removed]', '']:
                    print(f"    Skipping deleted/removed comment {i+1}")
                    continue
                
                print(f"    Comment {i+1}: {body[:50]}...")
                
                top_comments.append({
                    'body': body
                })
                
            except Exception as e:
                print(f"    Error processing comment {i+1}: {e}")
                print(f"    DEBUG: Comment error type: {type(e).__name__}")
                print(f"    DEBUG: Comment error details: {str(e)}")
                if hasattr(e, 'args') and e.args:
                    print(f"    DEBUG: Comment error args: {e.args}")
                continue
    
    except Exception as e:
        print(f"Error getting comments for post: {e}")
    
    return top_comments


def save_to_js(data: List[Dict[str, Any]], filename: str = '../data.js'):
    """
    Save the scraped data to a JavaScript file
    """
    with open(filename, 'w', encoding='utf-8') as f:
        f.write('// Reddit AskReddit posts data\n')
        f.write('// Generated by scraper.py\n\n')
        f.write('const redditData = ')
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write(';\n')
    
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
        
        # Save to JS
        save_to_js(posts_data)
        
        print("Scraping completed successfully!")
        
    except Exception as e:
        print(f"Error occurred: {str(e)}")
        print("\nMake sure you have installed Playwright and its browsers:")
        print("uv sync")
        print("uv run playwright install")

if __name__ == "__main__":
    main()
