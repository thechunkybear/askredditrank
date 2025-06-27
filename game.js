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
        this.renderQuestions();
        this.renderAnswers();
    }

    renderQuestions() {
        const questionsContainer = document.getElementById('questions-list');
        questionsContainer.innerHTML = '';

        this.currentQuestions.forEach((question, index) => {
            const questionDiv = document.createElement('div');
            questionDiv.className = 'question-item';
            questionDiv.dataset.questionId = question.id;
            
            const matchedAnswer = this.userMatches[question.id];
            const matchIndicator = matchedAnswer !== undefined ? 
                `<span class="match-indicator">${String.fromCharCode(65 + this.currentAnswers.findIndex(a => a.id === matchedAnswer))}</span>` : '';
            
            questionDiv.innerHTML = `
                <span class="question-number">${index + 1}</span>
                <span class="question-text">${question.text}</span>
                ${matchIndicator}
            `;

            questionDiv.addEventListener('click', () => this.selectQuestion(question.id));
            questionsContainer.appendChild(questionDiv);
        });
    }

    renderAnswers() {
        const answersContainer = document.getElementById('answers-list');
        answersContainer.innerHTML = '';

        this.currentAnswers.forEach((answer, index) => {
            const answerDiv = document.createElement('div');
            answerDiv.className = 'answer-item';
            answerDiv.dataset.answerId = answer.id;
            
            // Check if this answer is already matched
            const isMatched = Object.values(this.userMatches).includes(answer.id);
            if (isMatched) {
                answerDiv.classList.add('matched');
            }
            
            answerDiv.innerHTML = `
                <span class="answer-letter">${String.fromCharCode(65 + index)}</span>
                <span class="answer-text">${answer.text}</span>
            `;

            if (!isMatched) {
                answerDiv.addEventListener('click', () => this.selectAnswer(answer.id));
            }
            
            answersContainer.appendChild(answerDiv);
        });
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
        const correctAnswersDiv = document.getElementById('correct-answers');

        scoreP.textContent = `You got ${correctCount} out of 5 correct! (${Math.round(correctCount/5*100)}%)`;
        
        correctAnswersDiv.innerHTML = '';
        results.forEach((result, index) => {
            const resultDiv = document.createElement('div');
            resultDiv.className = `correct-answer ${result.isCorrect ? '' : 'wrong'}`;
            
            resultDiv.innerHTML = `
                <strong>Question ${index + 1}:</strong> ${result.question}<br>
                <strong>Your Answer:</strong> ${result.userAnswer}<br>
                <strong>Correct Answer:</strong> ${result.correctAnswer}
            `;
            
            correctAnswersDiv.appendChild(resultDiv);
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
