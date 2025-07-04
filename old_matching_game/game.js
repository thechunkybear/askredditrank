class RedditMatchingGame {
    constructor() {
        this.gameData = [];
        this.correctQuestion = null;
        this.currentAnswers = [];
        this.questionChoices = [];
        this.selectedQuestionId = null;
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
        
        // Filter out questions without good answers
        this.gameData = this.gameData.filter(question => 
            question.top_answers && 
            question.top_answers.length > 0 && 
            question.top_answers[0].text && 
            question.top_answers[0].text.length > 10
        );
        
        if (this.gameData.length < 5) {
            throw new Error('Not enough valid questions for the game');
        }
    }

    setupEventListeners() {
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
        this.selectedQuestionId = null;

        // Clear any previous result indicators
        document.querySelectorAll('.result-indicator').forEach(indicator => indicator.remove());
        document.querySelectorAll('.question-item, .answer-item').forEach(item => {
            item.classList.remove('result-correct', 'result-incorrect', 'selected');
        });

        // Select game data
        this.selectGameData();
        this.renderGame();
    }

    selectGameData() {
        // Select one random question for the correct question and its answers
        const shuffled = [...this.gameData].sort(() => Math.random() - 0.5);
        const correctQuestion = shuffled[0];
        
        this.correctQuestion = {
            id: 0,
            text: correctQuestion.text
        };

        // Get up to 5 top answers
        this.currentAnswers = correctQuestion.top_answers.slice(0, 5).map((answer, index) => ({
            id: index,
            text: answer.text
        }));

        // Select 4 other random questions as wrong choices
        const otherQuestions = shuffled.slice(1, 5);
        
        // Create question choices (1 correct + 4 wrong)
        this.questionChoices = [
            this.correctQuestion,
            ...otherQuestions.map((question, index) => ({
                id: index + 1,
                text: question.text
            }))
        ];

        // Shuffle question choices so correct answer isn't always first
        this.questionChoices.sort(() => Math.random() - 0.5);
    }

    renderGame() {
        // Render answers
        const answersContainer = document.getElementById('answers-container');
        answersContainer.innerHTML = '';

        this.currentAnswers.forEach((answer, index) => {
            const answerDiv = document.createElement('div');
            answerDiv.className = 'answer-item';
            answerDiv.innerHTML = `
                <span class="answer-letter">${String.fromCharCode(65 + index)}</span>
                <span class="answer-text">${answer.text}</span>
            `;
            answersContainer.appendChild(answerDiv);
        });

        // Render question choices
        const questionsContainer = document.getElementById('questions-container');
        questionsContainer.innerHTML = '';

        this.questionChoices.forEach((question, index) => {
            const questionDiv = document.createElement('div');
            questionDiv.className = 'question-item';
            questionDiv.dataset.questionId = question.id;
            
            questionDiv.innerHTML = `
                <span class="question-number">${index + 1}</span>
                <span class="question-text">${question.text}</span>
            `;

            questionDiv.addEventListener('click', () => this.selectQuestion(question.id));
            questionsContainer.appendChild(questionDiv);
        });
    }

    selectQuestion(questionId) {
        // Remove previous selection
        document.querySelectorAll('.question-item').forEach(item => {
            item.classList.remove('selected');
        });

        // Select new question
        this.selectedQuestionId = questionId;
        document.querySelector(`[data-question-id="${questionId}"]`).classList.add('selected');
        
        // Immediately show results
        this.submitAnswers();
    }

    submitAnswers() {
        const isCorrect = this.selectedQuestionId === this.correctQuestion.id;
        const selectedQuestion = this.questionChoices.find(q => q.id === this.selectedQuestionId);
        
        this.showResults(isCorrect, selectedQuestion.text, this.correctQuestion.text);
    }

    showResults(isCorrect, selectedQuestionText, correctQuestionText) {
        const resultsDiv = document.getElementById('results');
        const scoreP = document.getElementById('score');

        if (isCorrect) {
            scoreP.textContent = `Correct! 🎉`;
            scoreP.style.color = '#28a745';
        } else {
            scoreP.textContent = `Incorrect. The correct question was: "${correctQuestionText}"`;
            scoreP.style.color = '#dc3545';
        }
        
        // Mark all questions as correct or incorrect
        this.questionChoices.forEach(question => {
            const questionElement = document.querySelector(`[data-question-id="${question.id}"]`);
            
            if (question.id === this.correctQuestion.id) {
                questionElement.classList.add('result-correct');
                
                // Add correct indicator
                const correctIndicator = document.createElement('span');
                correctIndicator.className = 'result-indicator correct';
                correctIndicator.textContent = '✓';
                questionElement.appendChild(correctIndicator);
            } else if (question.id === this.selectedQuestionId) {
                questionElement.classList.add('result-incorrect');
                
                // Add incorrect indicator
                const incorrectIndicator = document.createElement('span');
                incorrectIndicator.className = 'result-indicator incorrect';
                incorrectIndicator.textContent = '✗';
                questionElement.appendChild(incorrectIndicator);
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
