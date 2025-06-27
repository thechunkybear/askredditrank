import json
import time
from datetime import datetime
import re
from typing import List, Dict, Any
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

def retry_with_backoff(func, max_retries=3, base_delay=1):
    """
    Retry a function with exponential backoff for HTTP 429 errors
    """
    for attempt in range(max_retries + 1):
        try:
            return func()
        except Exception as e:
            # Check if this is an HTTP error by looking at the response
            is_429_error = False
            is_http_error = False
            
            # Try to extract HTTP status from error message
            error_str = str(e).lower()
            if '429' in error_str or 'too many requests' in error_str:
                is_429_error = True
                is_http_error = True
            elif any(code in error_str for code in ['400', '401', '403', '404', '500', '502', '503', '504']):
                is_http_error = True
            
            if is_http_error and not is_429_error:
                # Non-429 HTTP errors should fail immediately
                print(f"HTTP error (non-429) encountered: {e}")
                raise e
            elif is_429_error and attempt < max_retries:
                # 429 errors should be retried with backoff
                delay = base_delay * (2 ** attempt)
                print(f"Rate limited (429), retrying in {delay} seconds... (attempt {attempt + 1}/{max_retries + 1})")
                time.sleep(delay)
                continue
            elif attempt < max_retries:
                # Other errors (network, timeout, etc.) get one retry with shorter delay
                delay = base_delay
                print(f"Error encountered, retrying in {delay} seconds... (attempt {attempt + 1}/{max_retries + 1}): {e}")
                time.sleep(delay)
                continue
            else:
                # Max retries reached
                print(f"Max retries reached, failing: {e}")
                raise e

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
        def navigate_to_page():
            response = page.goto(url, wait_until='networkidle')
            if response.status >= 400:
                raise Exception(f"HTTP {response.status} error when loading page")
            return response
        
        response = retry_with_backoff(navigate_to_page)
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
                
                def navigate_to_next_page():
                    response = page.goto(next_url)
                    if response.status >= 400:
                        raise Exception(f"HTTP {response.status} error when loading next page")
                    return response
                
                retry_with_backoff(navigate_to_next_page)
                
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
        
        def navigate_to_post():
            response = page.goto(post_url)
            if response.status >= 400:
                raise Exception(f"HTTP {response.status} error when loading post")
            return response
        
        retry_with_backoff(navigate_to_post)
        
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
        
        # Get top-level comments only (not replies)
        # Try multiple approaches to ensure we get only top-level comments
        comments = []
        
        # Method 1: Use CSS selector for direct children of commentarea
        top_level_comments = page.query_selector_all('.commentarea > .sitetable > .comment')
        if top_level_comments:
            comments = top_level_comments[:5]
            print(f"  Found {len(comments)} top-level comments using direct child selector")
        else:
            # Method 2: Use class-based filtering
            potential_comments = page.query_selector_all('.comment')
            for comment in potential_comments:
                # Check if this comment has the 'child' class (indicates it's a reply)
                class_attr = comment.get_attribute('class') or ''
                if 'child' not in class_attr:
                    comments.append(comment)
                    if len(comments) >= 5:
                        break
            print(f"  Found {len(comments)} top-level comments using class filtering")
        
        # Method 3: If still no comments, try data-depth attribute filtering
        if not comments:
            all_comments = page.query_selector_all('.comment[data-depth]')
            for comment in all_comments:
                depth = comment.get_attribute('data-depth')
                if depth == '0':  # Top-level comments have depth 0
                    comments.append(comment)
                    if len(comments) >= 5:
                        break
            print(f"  Found {len(comments)} top-level comments using depth filtering")
        
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
