class RedditOrderingGame {
    constructor() {
        this.gameData = [];
        this.currentQuestion = null;
        this.currentAnswers = [];
        this.userOrder = [];
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
        
        this.gameData = redditData;
        
        // Debug: Log the structure of the first few items
        console.log('Sample data structure:', this.gameData.slice(0, 2));
        
        // Filter out questions without at least 3 good answers (reduced from 5)
        this.gameData = this.gameData.filter(question => 
            question.answers && Array.isArray(question.answers) && question.answers.length >= 3
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

        this.selectGameData();
        this.renderGame();
    }

    selectGameData() {
        // Select a random question
        const randomIndex = Math.floor(Math.random() * this.gameData.length);
        this.currentQuestion = this.gameData[randomIndex];
        
        // Take up to 5 answers (or however many are available) and shuffle them for display
        const numAnswers = Math.min(5, this.currentQuestion.answers.length);
        this.currentAnswers = this.currentQuestion.answers.slice(0, numAnswers).map((answer, index) => ({
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
            answerDiv.className = 'answer-item';
            answerDiv.draggable = true;
            answerDiv.dataset.answerId = answer.id;
            answerDiv.innerHTML = `
                <div class="drag-handle">⋮⋮</div>
                <div class="rank-number">${index + 1}</div>
                <div class="answer-text">${answer.text}</div>
            `;

            // Add drag event listeners
            answerDiv.addEventListener('dragstart', (e) => this.handleDragStart(e));
            answerDiv.addEventListener('dragover', (e) => this.handleDragOver(e));
            answerDiv.addEventListener('drop', (e) => this.handleDrop(e));
            answerDiv.addEventListener('dragend', (e) => this.handleDragEnd(e));

            answersList.appendChild(answerDiv);
        });
    }

    handleDragStart(e) {
        e.dataTransfer.setData('text/plain', e.target.dataset.answerId);
        e.target.classList.add('dragging');
    }

    handleDragOver(e) {
        e.preventDefault();
        const draggingElement = document.querySelector('.dragging');
        const afterElement = this.getDragAfterElement(e.currentTarget.parentNode, e.clientY);
        
        if (afterElement == null) {
            e.currentTarget.parentNode.appendChild(draggingElement);
        } else {
            e.currentTarget.parentNode.insertBefore(draggingElement, afterElement);
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
        const correctOrder = [...this.currentAnswers].sort((a, b) => a.originalRank - b.originalRank);
        const userOrderIds = this.userOrder.map(a => a.id);
        const correctOrderIds = correctOrder.map(a => a.id);
        
        let correctPositions = 0;
        for (let i = 0; i < userOrderIds.length; i++) {
            if (userOrderIds[i] === correctOrderIds[i]) {
                correctPositions++;
            }
        }

        this.showResults(correctPositions, correctOrder);
    }

    showResults(correctPositions, correctOrder) {
        document.getElementById('game-container').style.display = 'none';
        document.getElementById('results').style.display = 'block';
        document.getElementById('new-game-btn').style.display = 'inline-block';

        const scoreDiv = document.getElementById('score');
        const correctOrderDiv = document.getElementById('correct-order');

        // Show score
        const totalAnswers = this.currentAnswers.length;
        const percentage = Math.round((correctPositions / totalAnswers) * 100);
        scoreDiv.innerHTML = `
            <h3>Your Score: ${correctPositions}/${totalAnswers} correct positions (${percentage}%)</h3>
        `;

        if (correctPositions === totalAnswers) {
            scoreDiv.innerHTML += '<p style="color: #28a745;">Perfect! 🎉</p>';
        } else if (correctPositions >= Math.ceil(totalAnswers * 0.6)) {
            scoreDiv.innerHTML += '<p style="color: #ffc107;">Good job! 👍</p>';
        } else {
            scoreDiv.innerHTML += '<p style="color: #dc3545;">Keep trying! 💪</p>';
        }

        // Show correct order
        correctOrderDiv.innerHTML = '<h4>Correct Order (by votes):</h4>';
        const orderList = document.createElement('ol');
        correctOrder.forEach(answer => {
            const listItem = document.createElement('li');
            listItem.innerHTML = `${answer.text} <span class="vote-count">(${answer.votes} votes)</span>`;
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
