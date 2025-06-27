class RedditOrderingGame {
    constructor() {
        this.gameData = [];
        this.currentQuestion = null;
        this.currentAnswers = [];
        this.userOrder = [];
        this.lockedPositions = new Set();
        this.attempts = 0;
    }

    async init() {
        try {
            await this.loadData();
            this.setupEventListeners();
            this.startNewGame();
        } catch (error) {
            console.error('Failed to initialize game:', error);
            this.showError();
        }
    }

    async loadData() {
        // Data is loaded from data.js as a global variable
        if (typeof redditData === 'undefined') {
            throw new Error('Reddit data not found. Make sure data.js is loaded.');
        }
        
        // Convert minified format to standard format
        // Minified format: [id, text, votes, timestamp, datetime, [[answer_text, votes], ...]]
        this.gameData = redditData.map(item => ({
            id: item[0],
            text: item[1],
            votes: item[2],
            timestamp: item[3],
            datetime: item[4],
            top_answers: item[5].map(answer => ({
                text: answer[0],
                votes: answer[1]
            }))
        }));
        
        // Debug: Log the structure of the first few items
        console.log('Sample data structure:', this.gameData.slice(0, 2));
        
        // Filter out questions without at least 3 good answers (reduced from 5)
        this.gameData = this.gameData.filter(question => 
            question.top_answers && Array.isArray(question.top_answers) && question.top_answers.length >= 3
        );

        console.log(`Found ${this.gameData.length} suitable questions`);

        if (this.gameData.length === 0) {
            throw new Error('No suitable questions found in the data. Check console for data structure.');
        }
    }

    setupEventListeners() {
        document.getElementById('submit-btn').addEventListener('click', () => this.submitOrder());
        document.getElementById('new-game-btn').addEventListener('click', () => this.startNewGame());
    }

    startNewGame() {
        // Hide loading, error, and results; show game
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'none';
        document.getElementById('game-container').style.display = 'block';
        document.getElementById('results').style.display = 'none';
        document.getElementById('new-game-btn').style.display = 'none';
        document.getElementById('submit-btn').style.display = 'inline-block';

        // Clean up any existing win messages
        const existingWinMessage = document.querySelector('.win-message');
        if (existingWinMessage) {
            existingWinMessage.remove();
        }

        // Reset game state
        this.lockedPositions.clear();
        this.attempts = 0;

        this.selectGameData();
        this.renderGame();
    }

    selectGameData() {
        // Select a random question
        const randomIndex = Math.floor(Math.random() * this.gameData.length);
        this.currentQuestion = this.gameData[randomIndex];
        
        // Take up to 5 answers (or however many are available) and shuffle them for display
        const numAnswers = Math.min(5, this.currentQuestion.top_answers.length);
        this.currentAnswers = this.currentQuestion.top_answers.slice(0, numAnswers).map((answer, index) => ({
            id: index,
            text: answer.text,
            votes: answer.votes,
            originalRank: index
        }));

        // Shuffle the answers for display
        this.currentAnswers = this.shuffleArray([...this.currentAnswers]);
        this.userOrder = [...this.currentAnswers];
    }

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    renderGame() {
        // Render question
        document.getElementById('question-text').textContent = this.currentQuestion.text;

        // Render answers list
        const answersList = document.getElementById('answers-list');
        answersList.innerHTML = '';

        this.userOrder.forEach((answer, index) => {
            const answerDiv = document.createElement('div');
            const isLocked = this.lockedPositions.has(index);
            
            answerDiv.className = `answer-item ${isLocked ? 'locked' : ''}`;
            answerDiv.draggable = !isLocked;
            answerDiv.dataset.answerId = answer.id;
            answerDiv.innerHTML = `
                <div class="drag-handle">${isLocked ? '✓' : '⋮⋮'}</div>
                <div class="rank-number">${index + 1}</div>
                <div class="answer-text">${answer.text}</div>
                ${isLocked ? `<div class="vote-display">${answer.votes.toLocaleString()} votes</div>` : ''}
            `;

            if (!isLocked) {
                // Add drag event listeners only for unlocked items
                answerDiv.addEventListener('dragstart', (e) => this.handleDragStart(e));
                answerDiv.addEventListener('dragover', (e) => this.handleDragOver(e));
                answerDiv.addEventListener('drop', (e) => this.handleDrop(e));
                answerDiv.addEventListener('dragend', (e) => this.handleDragEnd(e));
            }

            answersList.appendChild(answerDiv);
        });
    }

    handleDragStart(e) {
        // Don't allow dragging locked items
        if (e.target.classList.contains('locked')) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData('text/plain', e.target.dataset.answerId);
        e.target.classList.add('dragging');
    }

    handleDragOver(e) {
        e.preventDefault();
        const draggingElement = document.querySelector('.dragging');
        if (!draggingElement) return;
        
        const container = e.currentTarget.parentNode;
        const afterElement = this.getDragAfterElement(container, e.clientY);
        
        // Calculate what the new position would be
        let targetPosition;
        if (afterElement == null) {
            targetPosition = container.children.length - 1;
        } else {
            targetPosition = Array.from(container.children).indexOf(afterElement);
        }
        
        // Don't allow dropping on locked positions
        if (this.lockedPositions.has(targetPosition)) {
            return;
        }
        
        // Get current position of dragging element
        const currentPosition = Array.from(container.children).indexOf(draggingElement);
        
        // Don't move if already in the right position
        if (currentPosition === targetPosition) {
            return;
        }
        
        // Perform the move while respecting locked positions
        this.moveElementRespectingLocks(draggingElement, targetPosition, container);
    }

    handleDrop(e) {
        e.preventDefault();
        this.updateUserOrder();
    }

    handleDragEnd(e) {
        e.target.classList.remove('dragging');
        this.updateUserOrder();
    }

    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.answer-item:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    moveElementRespectingLocks(draggingElement, targetPosition, container) {
        // Get all elements and their current positions
        const allElements = Array.from(container.children);
        const currentPosition = allElements.indexOf(draggingElement);
        
        // Don't move if target position is locked
        if (this.lockedPositions.has(targetPosition)) {
            return;
        }
        
        // Don't move if current position is locked (shouldn't happen, but safety check)
        if (this.lockedPositions.has(currentPosition)) {
            return;
        }
        
        // For a simple swap between two unlocked positions, just swap the elements
        const targetElement = allElements[targetPosition];
        
        // Create new order by swapping the two elements
        const newOrder = [...allElements];
        newOrder[currentPosition] = targetElement;
        newOrder[targetPosition] = draggingElement;
        
        // Verify that all locked items remain in their original positions
        let isValidMove = true;
        for (let i = 0; i < newOrder.length; i++) {
            if (this.lockedPositions.has(i)) {
                // This position should contain the same element as before
                if (newOrder[i] !== allElements[i]) {
                    isValidMove = false;
                    break;
                }
            }
        }
        
        // Only perform the move if it doesn't displace locked items
        if (isValidMove) {
            // Clear the container and rebuild in the new order
            container.innerHTML = '';
            newOrder.forEach(element => container.appendChild(element));
        }
    }

    wouldDisplaceLockedItems(newPosition) {
        // Don't allow dropping directly onto a locked position
        if (this.lockedPositions.has(newPosition)) {
            return true;
        }
        
        // Allow all other moves - we'll handle the DOM manipulation carefully
        // to ensure locked items stay in place
        return false;
    }

    updateUserOrder() {
        const answerElements = document.querySelectorAll('.answer-item');
        this.userOrder = [];
        
        answerElements.forEach((element, index) => {
            const answerId = parseInt(element.dataset.answerId);
            const answer = this.currentAnswers.find(a => a.id === answerId);
            this.userOrder.push(answer);
            
            // Update rank number
            element.querySelector('.rank-number').textContent = index + 1;
        });
    }

    submitOrder() {
        this.attempts++;
        
        // Ensure userOrder is up to date with current DOM order
        this.updateUserOrder();
        
        const correctOrder = [...this.currentAnswers].sort((a, b) => a.originalRank - b.originalRank);
        const userOrderIds = this.userOrder.map(a => a.id);
        const correctOrderIds = correctOrder.map(a => a.id);
        
        // Check which positions are correct and lock them
        for (let i = 0; i < userOrderIds.length; i++) {
            if (userOrderIds[i] === correctOrderIds[i]) {
                this.lockedPositions.add(i);
            }
        }

        // Check if all positions are correct
        if (this.lockedPositions.size === this.currentAnswers.length) {
            this.showFinalResults();
        } else {
            // Re-render to show locked positions
            this.renderGame();
            this.showPartialFeedback();
        }
    }

    showPartialFeedback() {
        // Show a brief feedback message
        const feedbackDiv = document.createElement('div');
        feedbackDiv.className = 'partial-feedback';
        feedbackDiv.innerHTML = `
            <p>${this.lockedPositions.size} correct! Keep going...</p>
        `;
        
        // Insert feedback after the ordering section
        const orderingSection = document.querySelector('.ordering-section');
        const existingFeedback = document.querySelector('.partial-feedback');
        if (existingFeedback) {
            existingFeedback.remove();
        }
        orderingSection.appendChild(feedbackDiv);
        
        // Remove feedback after 2 seconds
        setTimeout(() => {
            if (feedbackDiv.parentNode) {
                feedbackDiv.remove();
            }
        }, 2000);
    }

    showFinalResults() {
        // Show confetti animation
        this.showConfetti();
        
        // Hide submit button and show new game button
        document.getElementById('submit-btn').style.display = 'none';
        document.getElementById('new-game-btn').style.display = 'inline-block';

        // Create and show win message
        const winMessage = document.createElement('div');
        winMessage.className = 'win-message';
        winMessage.innerHTML = `
            <h3>Congratulations! 🎉</h3>
            <p>You got all ${this.currentAnswers.length} answers in the correct order!</p>
            <p>It took you ${this.attempts} attempt${this.attempts === 1 ? '' : 's'}.</p>
            ${this.attempts === 1 ? '<p style="font-weight: bold;">Perfect on the first try! 🏆</p>' : 
              this.attempts <= 3 ? '<p>Excellent work! 👏</p>' : 
              '<p>Great persistence! 💪</p>'}
        `;

        // Insert win message after the ordering section
        const orderingSection = document.querySelector('.ordering-section');
        const existingWinMessage = document.querySelector('.win-message');
        if (existingWinMessage) {
            existingWinMessage.remove();
        }
        orderingSection.appendChild(winMessage);

        // Show final order with votes in the answers list
        this.showFinalOrderWithVotes();
    }

    showConfetti() {
        const confettiContainer = document.createElement('div');
        confettiContainer.className = 'confetti';
        document.body.appendChild(confettiContainer);

        // Create confetti pieces
        for (let i = 0; i < 100; i++) {
            const confettiPiece = document.createElement('div');
            confettiPiece.className = 'confetti-piece';
            confettiPiece.style.left = Math.random() * 100 + '%';
            confettiPiece.style.animationDelay = Math.random() * 2 + 's';
            confettiPiece.style.animationDuration = (Math.random() * 2 + 2) + 's';
            confettiContainer.appendChild(confettiPiece);
        }

        // Remove confetti after animation
        setTimeout(() => {
            if (confettiContainer.parentNode) {
                confettiContainer.remove();
            }
        }, 5000);
    }

    showFinalOrderWithVotes() {
        // Update the answers list to show the final order with votes
        const answersList = document.getElementById('answers-list');
        const correctOrder = [...this.currentAnswers].sort((a, b) => a.originalRank - b.originalRank);
        
        answersList.innerHTML = '';
        correctOrder.forEach((answer, index) => {
            const answerDiv = document.createElement('div');
            answerDiv.className = 'answer-item locked';
            answerDiv.innerHTML = `
                <div class="drag-handle">✓</div>
                <div class="rank-number">${index + 1}</div>
                <div class="answer-text">${answer.text}</div>
                <div class="vote-display">${answer.votes.toLocaleString()} votes</div>
            `;
            answersList.appendChild(answerDiv);
        });
    }

    showError() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'block';
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const game = new RedditOrderingGame();
    game.init();
});
