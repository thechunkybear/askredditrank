class RedditMatchingGame {
    constructor() {
        this.gameData = [];
        this.currentQuestions = [];
        this.currentAnswers = [];
        this.userMatches = {}; // questionIndex -> answerIndex
        this.selectedQuestion = null;
        this.init();
    }

    async init() {
        try {
            await this.loadData();
            this.setupEventListeners();
            this.startNewGame();
        } catch (error) {
            this.showError();
        }
    }

    async loadData() {
        // Data is now loaded from data.js as a global variable
        if (typeof redditData === 'undefined') {
            throw new Error('Reddit data not found. Make sure data.js is loaded.');
        }
        
        this.gameData = redditData;
        
        // Filter out posts without good answers
        this.gameData = this.gameData.filter(post => 
            post.top_comments && 
            post.top_comments.length > 0 && 
            post.top_comments[0].body && 
            post.top_comments[0].body.length > 10
        );
        
        if (this.gameData.length < 5) {
            throw new Error('Not enough valid posts for the game');
        }
    }

    setupEventListeners() {
        document.getElementById('submit-btn').addEventListener('click', () => this.submitAnswers());
        document.getElementById('new-game-btn').addEventListener('click', () => this.startNewGame());
    }

    startNewGame() {
        // Hide loading and error, show game
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'none';
        document.getElementById('game-container').style.display = 'block';
        document.getElementById('results').style.display = 'none';
        document.getElementById('new-game-btn').style.display = 'none';

        // Reset game state
        this.userMatches = {};
        this.selectedQuestion = null;

        // Clear any previous result indicators
        document.querySelectorAll('.result-indicator').forEach(indicator => indicator.remove());
        document.querySelectorAll('.question-item, .answer-item').forEach(item => {
            item.classList.remove('result-correct', 'result-incorrect');
        });

        // Select 5 random posts
        this.selectRandomPosts();
        this.renderGame();
        this.updateSubmitButton();
    }

    selectRandomPosts() {
        // Shuffle and take first 5 posts
        const shuffled = [...this.gameData].sort(() => Math.random() - 0.5);
        const selectedPosts = shuffled.slice(0, 5);

        this.currentQuestions = selectedPosts.map((post, index) => ({
            id: index,
            text: post.title,
            correctAnswer: index // Each question's correct answer has the same index
        }));

        this.currentAnswers = selectedPosts.map((post, index) => ({
            id: index,
            text: post.top_comments[0].body,
            questionId: index
        }));

        // Shuffle answers so they don't match the question order
        this.currentAnswers.sort(() => Math.random() - 0.5);
    }

    renderGame() {
        const gameRowsContainer = document.getElementById('game-rows');
        gameRowsContainer.innerHTML = '';

        // Create 5 rows, each containing an answer and a question
        for (let i = 0; i < 5; i++) {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'game-row';
            
            // Create answer item
            const answer = this.currentAnswers[i];
            const answerDiv = document.createElement('div');
            answerDiv.className = 'answer-item';
            answerDiv.dataset.answerId = answer.id;
            
            // Check if this answer is already matched
            const isMatched = Object.values(this.userMatches).includes(answer.id);
            if (isMatched) {
                answerDiv.classList.add('matched');
            }
            
            answerDiv.innerHTML = `
                <span class="answer-letter">${String.fromCharCode(65 + i)}</span>
                <span class="answer-text">${answer.text}</span>
            `;

            if (!isMatched) {
                answerDiv.addEventListener('click', () => this.selectAnswer(answer.id));
            }
            
            // Create question item
            const question = this.currentQuestions[i];
            const questionDiv = document.createElement('div');
            questionDiv.className = 'question-item';
            questionDiv.dataset.questionId = question.id;
            
            const matchedAnswer = this.userMatches[question.id];
            const matchIndicator = matchedAnswer !== undefined ? 
                `<span class="match-indicator">${String.fromCharCode(65 + this.currentAnswers.findIndex(a => a.id === matchedAnswer))}</span>` : '';
            
            questionDiv.innerHTML = `
                <span class="question-number">${i + 1}</span>
                <span class="question-text">${question.text}</span>
                ${matchIndicator}
            `;

            questionDiv.addEventListener('click', () => this.selectQuestion(question.id));
            
            // Add both items to the row
            rowDiv.appendChild(answerDiv);
            rowDiv.appendChild(questionDiv);
            
            // Add row to container
            gameRowsContainer.appendChild(rowDiv);
        }
    }

    selectQuestion(questionId) {
        // Remove previous selection
        document.querySelectorAll('.question-item').forEach(item => {
            item.classList.remove('selected');
        });

        // Select new question
        this.selectedQuestion = questionId;
        document.querySelector(`[data-question-id="${questionId}"]`).classList.add('selected');
    }

    selectAnswer(answerId) {
        if (this.selectedQuestion === null) {
            alert('Please select a question first!');
            return;
        }

        // Remove any existing match for this question
        delete this.userMatches[this.selectedQuestion];

        // Add new match
        this.userMatches[this.selectedQuestion] = answerId;

        // Clear selection
        this.selectedQuestion = null;

        // Re-render to update UI
        this.renderGame();
        this.updateSubmitButton();
    }

    updateSubmitButton() {
        const submitBtn = document.getElementById('submit-btn');
        const allMatched = Object.keys(this.userMatches).length === 5;
        submitBtn.disabled = !allMatched;
    }

    submitAnswers() {
        let correctCount = 0;
        const results = [];

        this.currentQuestions.forEach(question => {
            const userAnswerId = this.userMatches[question.id];
            const isCorrect = userAnswerId === question.correctAnswer;
            
            if (isCorrect) correctCount++;

            const userAnswer = this.currentAnswers.find(a => a.id === userAnswerId);
            const correctAnswer = this.currentAnswers.find(a => a.id === question.correctAnswer);

            results.push({
                question: question.text,
                userAnswer: userAnswer ? userAnswer.text : 'No answer selected',
                correctAnswer: correctAnswer.text,
                isCorrect
            });
        });

        this.showResults(correctCount, results);
    }

    showResults(correctCount, results) {
        const resultsDiv = document.getElementById('results');
        const scoreP = document.getElementById('score');

        scoreP.textContent = `You got ${correctCount} out of 5 correct! (${Math.round(correctCount/5*100)}%)`;
        
        // Mark each question and answer as correct or incorrect
        results.forEach((result, index) => {
            const questionElement = document.querySelector(`[data-question-id="${index}"]`);
            const userAnswerId = this.userMatches[index];
            const userAnswerElement = document.querySelector(`[data-answer-id="${userAnswerId}"]`);
            
            if (result.isCorrect) {
                questionElement.classList.add('result-correct');
                userAnswerElement.classList.add('result-correct');
                
                // Add correct indicator
                const correctIndicator = document.createElement('span');
                correctIndicator.className = 'result-indicator correct';
                correctIndicator.textContent = '✓';
                questionElement.appendChild(correctIndicator);
                
                const correctIndicator2 = document.createElement('span');
                correctIndicator2.className = 'result-indicator correct';
                correctIndicator2.textContent = '✓';
                userAnswerElement.appendChild(correctIndicator2);
            } else {
                questionElement.classList.add('result-incorrect');
                userAnswerElement.classList.add('result-incorrect');
                
                // Add incorrect indicator
                const incorrectIndicator = document.createElement('span');
                incorrectIndicator.className = 'result-indicator incorrect';
                incorrectIndicator.textContent = '✗';
                questionElement.appendChild(incorrectIndicator);
                
                const incorrectIndicator2 = document.createElement('span');
                incorrectIndicator2.className = 'result-indicator incorrect';
                incorrectIndicator2.textContent = '✗';
                userAnswerElement.appendChild(incorrectIndicator2);
            }
        });

        resultsDiv.style.display = 'block';
        document.getElementById('new-game-btn').style.display = 'inline-block';
    }

    showError() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'block';
    }
}

// Start the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new RedditMatchingGame();
});
