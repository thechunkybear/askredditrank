class RedditOrderingGame {
    constructor() {
        this.gameData = [];
        this.currentQuestion = null;
        this.currentAnswers = [];
        this.userOrder = [];
        this.lockedAnswerIds = new Set();
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
        // Get current date in YYYYMMDD format
        const today = new Date();
        const dateStr = today.getFullYear().toString() + 
                       (today.getMonth() + 1).toString().padStart(2, '0') + 
                       today.getDate().toString().padStart(2, '0');
        
        // Load data from the current date's file
        const dataUrl = `data/${dateStr}_data.js`;
        
        try {
            // Dynamically load the data file
            const script = document.createElement('script');
            script.src = dataUrl;
            
            // Wait for the script to load
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = () => reject(new Error(`Failed to load data file: ${dataUrl}`));
                document.head.appendChild(script);
            });
            
            // Check if data was loaded
            if (typeof redditData === 'undefined') {
                throw new Error(`Reddit data not found in ${dataUrl}. Make sure the file exists and contains redditData.`);
            }
        } catch (error) {
            throw new Error(`Failed to load data for ${dateStr}: ${error.message}`);
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
    }

    startNewGame() {
        // Hide loading, error, and results; show game
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'none';
        document.getElementById('game-container').style.display = 'block';
        document.getElementById('results').style.display = 'none';
        document.getElementById('submit-btn').style.display = 'inline-block';

        // Clean up any existing win messages
        const existingWinMessage = document.querySelector('.win-message');
        if (existingWinMessage) {
            existingWinMessage.remove();
        }

        // Reset game state
        this.lockedAnswerIds.clear();
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
            const isLocked = this.lockedAnswerIds.has(answer.id);
            
            answerDiv.className = `answer-item ${isLocked ? 'locked' : ''}`;
            answerDiv.draggable = !isLocked;
            answerDiv.dataset.answerId = answer.id;
            answerDiv.dataset.position = index; // Track absolute position
            answerDiv.innerHTML = `
                <div class="drag-handle">${isLocked ? '✓' : '⋮⋮'}</div>
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
        this.isDragging = true;
        e.dataTransfer.setData('text/plain', e.target.dataset.answerId);
        
        // Create a transparent 1x1 pixel image to hide the drag ghost
        const img = new Image();
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
        e.dataTransfer.setDragImage(img, 0, 0);
        
        e.target.classList.add('dragging');
    }

    handleDragOver(e) {
        e.preventDefault();
        if (!this.isDragging) return;
        
        const draggingElement = document.querySelector('.dragging');
        if (!draggingElement) return;
        
        const container = e.currentTarget.parentNode;
        const targetPosition = this.getTargetPosition(container, e.clientY);
        
        if (targetPosition !== null) {
            this.moveToUnlockedPosition(draggingElement, targetPosition, container);
        }
    }

    handleDrop(e) {
        e.preventDefault();
        if (!this.isDragging) return;
        this.updateUserOrder();
    }

    handleDragEnd(e) {
        this.isDragging = false;
        e.target.classList.remove('dragging');
        this.updateUserOrder();
    }

    getTargetPosition(container, y) {
        const allElements = [...container.querySelectorAll('.answer-item')];
        
        // Find which position the mouse is closest to
        let targetPosition = allElements.length;
        
        for (let i = 0; i < allElements.length; i++) {
            const box = allElements[i].getBoundingClientRect();
            if (y < box.top + box.height / 2) {
                targetPosition = i;
                break;
            }
        }
        
        return targetPosition;
    }

    moveToUnlockedPosition(draggingElement, targetPosition, container) {
        const allElements = [...container.children];
        const currentPosition = allElements.indexOf(draggingElement);
        
        // If target position is locked, find the nearest unlocked position
        if (targetPosition < allElements.length && allElements[targetPosition].classList.contains('locked')) {
            targetPosition = this.findNearestUnlockedPosition(targetPosition, currentPosition, allElements);
        }
        
        if (targetPosition === null || targetPosition === currentPosition) {
            return;
        }
        
        // Perform the move by rebuilding the order with locked items in fixed positions
        this.reorderWithLockedPositions(draggingElement, targetPosition, container);
    }

    findNearestUnlockedPosition(targetPosition, currentPosition, allElements) {
        // Search for nearest unlocked position, preferring the direction of movement
        const direction = targetPosition > currentPosition ? 1 : -1;
        
        // First try in the direction of movement
        for (let i = targetPosition; i >= 0 && i < allElements.length; i += direction) {
            if (i !== currentPosition && !allElements[i].classList.contains('locked')) {
                return i;
            }
        }
        
        // Then try the opposite direction
        for (let i = targetPosition - direction; i >= 0 && i < allElements.length; i -= direction) {
            if (i !== currentPosition && !allElements[i].classList.contains('locked')) {
                return i;
            }
        }
        
        return null;
    }

    reorderWithLockedPositions(draggingElement, targetPosition, container) {
        const allElements = [...container.children];
        const currentPosition = allElements.indexOf(draggingElement);
        
        // Create a new order array
        const newOrder = [...allElements];
        
        // Remove the dragging element
        newOrder.splice(currentPosition, 1);
        
        // Insert it at the target position
        newOrder.splice(targetPosition > currentPosition ? targetPosition - 1 : targetPosition, 0, draggingElement);
        
        // Now ensure locked items stay in their original positions
        const finalOrder = new Array(allElements.length);
        const unlockedElements = [];
        
        // First pass: place locked items in their fixed positions
        allElements.forEach((element, index) => {
            if (element.classList.contains('locked')) {
                finalOrder[index] = element;
            }
        });
        
        // Second pass: collect unlocked elements in their new order
        newOrder.forEach(element => {
            if (!element.classList.contains('locked')) {
                unlockedElements.push(element);
            }
        });
        
        // Third pass: fill remaining positions with unlocked elements
        let unlockedIndex = 0;
        for (let i = 0; i < finalOrder.length; i++) {
            if (!finalOrder[i]) {
                finalOrder[i] = unlockedElements[unlockedIndex++];
            }
        }
        
        // Rebuild the DOM
        container.innerHTML = '';
        finalOrder.forEach(element => {
            container.appendChild(element);
        });
    }


    updateUserOrder() {
        const answerElements = document.querySelectorAll('.answer-item');
        this.userOrder = [];
        
        answerElements.forEach((element, index) => {
            const answerId = parseInt(element.dataset.answerId);
            const answer = this.currentAnswers.find(a => a.id === answerId);
            this.userOrder.push(answer);
            
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
                this.lockedAnswerIds.add(userOrderIds[i]);
            }
        }

        // Check if all positions are correct
        if (this.lockedAnswerIds.size === this.currentAnswers.length) {
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
            <p>${this.lockedAnswerIds.size} correct! Keep going...</p>
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
        
        // Hide submit button
        document.getElementById('submit-btn').style.display = 'none';

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

        // Create confetti pieces from all sides
        for (let i = 0; i < 150; i++) {
            const confettiPiece = document.createElement('div');
            const isUpArrow = Math.random() < 0.5;
            confettiPiece.className = `confetti-piece ${isUpArrow ? 'up-arrow' : 'down-arrow'}`;
            
            // Choose random side to shoot from
            const side = Math.floor(Math.random() * 4); // 0=top, 1=right, 2=bottom, 3=left
            
            switch(side) {
                case 0: // from top
                    confettiPiece.style.left = Math.random() * 100 + '%';
                    confettiPiece.style.top = '-20px';
                    confettiPiece.style.animationName = 'confetti-fall-from-top';
                    break;
                case 1: // from right
                    confettiPiece.style.right = '-20px';
                    confettiPiece.style.top = Math.random() * 100 + '%';
                    confettiPiece.style.animationName = 'confetti-fall-from-right';
                    break;
                case 2: // from bottom
                    confettiPiece.style.left = Math.random() * 100 + '%';
                    confettiPiece.style.bottom = '-20px';
                    confettiPiece.style.animationName = 'confetti-fall-from-bottom';
                    break;
                case 3: // from left
                    confettiPiece.style.left = '-20px';
                    confettiPiece.style.top = Math.random() * 100 + '%';
                    confettiPiece.style.animationName = 'confetti-fall-from-left';
                    break;
            }
            
            confettiPiece.style.animationDelay = Math.random() * 1 + 's';
            confettiPiece.style.animationDuration = (Math.random() * 1 + 1) + 's';
            confettiContainer.appendChild(confettiPiece);
        }

        // Remove confetti after animation
        setTimeout(() => {
            if (confettiContainer.parentNode) {
                confettiContainer.remove();
            }
        }, 3000);
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
