const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

export default async function handler(req, res) {
    if (req.method === 'POST') {
        try {
            // Unpack the stringified arrays
            const { links: links, questions: questions } = req.body;

            console.log(`Processing request. Links: ${links} | Questions: ${questions}`);

            // Initialize answers array with 'Unknown' for each question
            let answers = Array(questions.length).fill('Unknown');

            for (const link of links) {
                console.log(`Checking link: ${link}`);

                // Fetch page content
                const pageContentResponse = await fetch('https://url-content-retriever.vercel.app/api/retriever', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ url: link }),
                });

                if (!pageContentResponse.ok) {
                    console.error(`Failed to fetch page content for ${link}`);
                    continue;
                }

                const pageContentData = await pageContentResponse.json();
                const pageContent = pageContentData.content; // Adjust if the API returns differently

                console.log(`Page content: ${pageContent}`);

                // Get indices of unanswered questions
                const unansweredIndices = answers
                    .map((ans, idx) => (ans === 'Unknown' ? idx : -1))
                    .filter(idx => idx !== -1);

                // If no unanswered questions, break
                if (unansweredIndices.length === 0) {
                    console.log('All questions answered');
                    break;
                }

                // Prepare list of unanswered questions
                const unansweredQuestions = unansweredIndices.map(idx => questions[idx]);

                // Call LLM API with page content and unanswered questions
                const llmResponse = await fetch('https://google-generative-ai-nine.vercel.app/api/gemini', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ context: pageContent, questions: unansweredQuestions }),
                });

                if (!llmResponse.ok) {
                    console.error(`Failed to get LLM response for ${link}`);
                    continue;
                }

                const llmResponseText = await llmResponse.text();
                console.log(`LLM Response: ${llmResponseText}`);

                // Parse LLM response
                let answersString = llmResponseText.trim();
                if (answersString.startsWith('{') && answersString.endsWith('}')) {
                    answersString = answersString.substring(1, answersString.length - 1);
                }

                const llmAnswers = answersString.split('>');

                // Check if number of answers matches number of questions
                if (llmAnswers.length !== unansweredQuestions.length) {
                    console.error('Mismatch in number of answers and questions');
                    continue;
                }

                // Update answers array
                for (let i = 0; i < llmAnswers.length; i++) {
                    const answer = llmAnswers[i].trim();
                    const questionIndex = unansweredIndices[i];

                    if (answer.toLowerCase() !== 'unknown') {
                        answers[questionIndex] = answer;
                    }
                }
                console.log(`answers: ${answers}`);
            }

            // Send the final answers
            res.status(200).json({ answers });
        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
}
