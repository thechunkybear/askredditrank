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
        
        const afterElement = this.getDragAfterElement(e.currentTarget.parentNode, e.clientY);
        const container = e.currentTarget.parentNode;
        
        // Calculate what the new position would be
        let newPosition;
        if (afterElement == null) {
            newPosition = container.children.length - 1; // Last position (excluding the dragging element)
        } else {
            newPosition = Array.from(container.children).indexOf(afterElement);
        }
        
        // Check if this position would displace any locked items
        if (this.wouldDisplaceLockedItems(newPosition)) {
            return; // Don't allow the drop
        }
        
        if (afterElement == null) {
            container.appendChild(draggingElement);
        } else {
            container.insertBefore(draggingElement, afterElement);
        }
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

    wouldDisplaceLockedItems(newPosition) {
        // Get current positions of all items
        const answerElements = document.querySelectorAll('.answer-item');
        const draggingElement = document.querySelector('.dragging');
        const draggingId = parseInt(draggingElement.dataset.answerId);
        
        // Find current position of dragging element
        let currentPosition = -1;
        answerElements.forEach((element, index) => {
            if (parseInt(element.dataset.answerId) === draggingId) {
                currentPosition = index;
            }
        });
        
        // Don't allow dropping directly onto a locked position
        if (this.lockedPositions.has(newPosition)) {
            return true;
        }
        
        // Check if moving would cause any locked items to shift
        const minPos = Math.min(currentPosition, newPosition);
        const maxPos = Math.max(currentPosition, newPosition);
        
        // Check if there are any locked positions between current and new position
        for (let pos = minPos; pos <= maxPos; pos++) {
            if (this.lockedPositions.has(pos) && pos !== currentPosition) {
                return true; // Would displace a locked item
            }
        }
        
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
        document.getElementById('game-container').style.display = 'none';
        document.getElementById('results').style.display = 'block';
        document.getElementById('new-game-btn').style.display = 'inline-block';

        const scoreDiv = document.getElementById('score');
        const correctOrderDiv = document.getElementById('correct-order');

        // Show final score
        scoreDiv.innerHTML = `
            <h3>Congratulations! 🎉</h3>
            <p>You got all ${this.currentAnswers.length} answers in the correct order!</p>
            <p>It took you ${this.attempts} attempt${this.attempts === 1 ? '' : 's'}.</p>
        `;

        if (this.attempts === 1) {
            scoreDiv.innerHTML += '<p style="color: #28a745; font-weight: bold;">Perfect on the first try! 🏆</p>';
        } else if (this.attempts <= 3) {
            scoreDiv.innerHTML += '<p style="color: #28a745;">Excellent work! 👏</p>';
        } else {
            scoreDiv.innerHTML += '<p style="color: #ffc107;">Great persistence! 💪</p>';
        }

        // Show final order with votes
        const correctOrder = [...this.currentAnswers].sort((a, b) => a.originalRank - b.originalRank);
        correctOrderDiv.innerHTML = '<h4>Final Order (by votes):</h4>';
        const orderList = document.createElement('ol');
        correctOrder.forEach(answer => {
            const listItem = document.createElement('li');
            listItem.innerHTML = `${answer.text} <span class="vote-count">(${answer.votes.toLocaleString()} votes)</span>`;
            orderList.appendChild(listItem);
        });
        correctOrderDiv.appendChild(orderList);
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
