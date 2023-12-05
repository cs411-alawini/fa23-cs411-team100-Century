const express = require('express');
const db = require('./db'); // Import the db.js file
const session = require('express-session');
const app = express();
const port = 3000;



app.use(session({
  secret: 'your_secret_key_here',
  resave: false,
  saveUninitialized: true
}));


app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.post('/add-user', (req, res) => {
  const { name } = req.body;

  // Set the isolation level to SERIALIZABLE
  const SET_ISOLATION_LEVEL_QUERY = 'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE';
  db.query(SET_ISOLATION_LEVEL_QUERY, (err) => {
    if (err) {
      console.error('Error setting isolation level:', err);
      res.status(500).send('Error setting isolation level');
      return;
    }

    // Start a transaction
    const BEGIN_TRANSACTION_QUERY = 'BEGIN';
    db.query(BEGIN_TRANSACTION_QUERY, (err) => {
      if (err) {
        console.error('Error starting transaction:', err);
        res.status(500).send('Error starting transaction');
        return;
      }

      // Check user existence
      const CHECK_USER_EXISTENCE_QUERY = 'SELECT COUNT(*) AS count FROM users WHERE u_name = ? FOR UPDATE';
      db.query(CHECK_USER_EXISTENCE_QUERY, [name], (err, results) => {
        if (err) {
          return db.query('ROLLBACK', () => {
            console.error('Error checking user existence:', err);
            res.status(500).send('Error checking user existence in database');
          });
        }

        const userExists = results[0].count > 0;

        if (userExists) {
          return db.query('ROLLBACK', () => {
            console.log('Username already exists:', name);
            res.status(400).send('Username already exists');
          });
        }

        // Find the largest current user_id
        const FIND_LARGEST_USER_ID_QUERY = 'SELECT MAX(CAST(u_id AS UNSIGNED)) AS max_user_id FROM users';
        db.query(FIND_LARGEST_USER_ID_QUERY, (err, results) => {
          if (err) {
            return db.query('ROLLBACK', () => {
              console.error('Error finding the largest user_id:', err);
              res.status(500).send('Error finding the largest user_id in database');
            });
          }

          const maxUserId = results[0].max_user_id || 0;
          const newUserNumericId = maxUserId + 1;

          // Insert new user
          const INSERT_USER_QUERY = 'INSERT INTO users (u_id, u_name, reputation) VALUES (?, ?, 0)';
          db.query(INSERT_USER_QUERY, [newUserNumericId.toString(), name], (err) => {
            if (err) {
              return db.query('ROLLBACK', () => {
                console.error('Error adding user:', err);
                res.status(500).send('Error adding user to database');
              });
            }

            // Commit the transaction
            db.query('COMMIT', (err) => {
              if (err) {
                console.error('Error committing transaction:', err);
                res.status(500).send('Error committing transaction');
              } else {
                console.log('Transaction committed successfully');
                res.status(200).send('User added successfully');
              }
            });
          });
        });
      });
    });
  });
});


app.get('/get-logged-in-user-id', (req, res) => {
  const loggedInUserId = req.session.username; // Assuming your user ID is stored in req.session.username
  res.json({ userId: loggedInUserId });
});


app.post('/submit-question', (req, res) => {
  const { title, body, tags } = req.body;

  const userId = req.session.username;

  const FIND_LARGEST_QUESTION_ID_QUERY = 'SELECT MAX(CAST(q_id AS UNSIGNED)) AS max_ques_id FROM questions';
  db.query(FIND_LARGEST_QUESTION_ID_QUERY, (err, results) => {
    if (err) {
      console.error('Error finding the largest question_id:', err);
      res.status(500).send('Error finding the largest question_id in the database');
      return;
    }

    const maxQuesId = results[0].max_ques_id || 0;
    const newQuesNumericId = maxQuesId + 1;

    const sql = 'INSERT INTO questions (q_id, title, q_body, q_creation_date, u_id, t_name) VALUES (?, ?, ?, NOW(), ?, ?)';
    db.query(sql, [newQuesNumericId, title, body, userId, tags], (err, result) => {
      if (err) {
        console.error('Error executing SQL query:', err);
        res.status(500).json({ error: 'Internal Server Error' });
        return;
      }

      console.log('Question submitted successfully');
      res.status(200).json({ message: 'Question submitted successfully' });
    });
  });
  //res.redirect('/');
});



// app.get('/keyword-search', (req, res) => {
//   const { keyword } = req.query;

//   if (!keyword) {
//       res.status(400).send('Missing keyword parameter');
//       return;
//   }

//   const KEYWORD_SEARCH_QUERY = 'SELECT * FROM questions WHERE body LIKE ?';
//   const keywordPattern = `%${keyword}%`;

//   db.query(KEYWORD_SEARCH_QUERY, [keywordPattern], (err, results) => {
//       if (err) {
//           console.error('Error performing keyword search:', err);
//           res.status(500).send('Error performing keyword search in database');
//           return;
//       }
//       res.json(results); // Send the retrieved questions as JSON response
//   });
// });

app.get('/keyword-search', (req, res) => {
  const { keyword } = req.query;

  if (!keyword) {
    res.status(400).send('Missing keyword parameter');
    return;
  }

  const KEYWORD_SEARCH_QUERY = 'SELECT * FROM questions WHERE q_body LIKE ?';
  const keywordPattern = `%${keyword}%`;

  db.query(KEYWORD_SEARCH_QUERY, [keywordPattern], (err, results) => {
    if (err) {
      console.error('Error performing keyword search:', err);
      res.status(500).send('Error performing keyword search in database');
      return;
    }
    res.json(results); // Send the retrieved questions as JSON response
  });
});


app.get('/trending-search', (req, res) => {
  const TRENDING_SEARCH_QUERY = `
      SELECT
          q.q_id,
          q.title,
          COUNT(DISTINCT c.c_id) AS num_comments,
          COUNT(DISTINCT a.a_id) AS num_answers,
          (COUNT(DISTINCT c.c_id) + COUNT(DISTINCT a.a_id)) AS total_responses
      FROM questions q
      LEFT JOIN comments c USING (q_id)
      LEFT JOIN answers a USING (q_id)
      GROUP BY q.q_id, q.title
      ORDER BY total_responses DESC
      LIMIT 15;
  `;

  db.query(TRENDING_SEARCH_QUERY, (err, results) => {
      if (err) {
          console.error('Error performing trending search:', err);
          res.status(500).send('Error performing trending search in database');
          return;
      }
      res.json(results); // Send the retrieved trending questions as JSON response
  });
});




app.get('/get-users', (req, res) => {
  const GET_USERS_QUERY = 'SELECT u_id, u_name FROM users ORDER BY u_id DESC LIMIT 10';
  db.query(GET_USERS_QUERY, (err, results) => {
    if (err) {
      console.error('Error fetching users:', err);
      res.status(500).send('Error fetching users from database');
      return;
    }
    res.json(results); // Send the retrieved users as JSON response
  });
});



// app.get('/users', (req, res) => {
//   res.sendFile(path.join(__dirname, 'http://localhost:3000/test2.html')); // Adjust the path
// });

app.post('/login', (req, res) => {
  const { username } = req.body; // Assuming you receive the username from a login form

  // Check if the provided username exists in the users table
  const CHECK_USER_EXISTENCE_QUERY = 'SELECT u_id FROM users WHERE u_name = ?';
  db.query(CHECK_USER_EXISTENCE_QUERY, [username], (err, results) => {
    if (err) {
      console.error('Error checking user existence:', err);
      res.status(500).send('Error checking user existence in database');
      return;
    }

    const user = results[0]; // Assuming username is unique, directly fetching the user

    if (!user) {
      console.log('Username does not exist:', username);
      res.status(400).send('Username does not exist');
    } else {
      const userID = user.u_id; // Get the u_id of the user

      // Store the userID in the session instead of the username
      req.session.username = userID;
      res.status(200).send('Logged in successfully');
    }
    console.log('Logged-in User ID:', req.session.username);
  });
});

app.delete('/questions/:q_id', (req, res) => {


  const loggedInUsername = req.session.username; // Retrieve username from the session
  const questionId = req.params.q_id; // Get the question ID from the request parameters

  // Check if the logged-in username is the owner of the question
  console.log('Question Id', questionId);
  db.query('SELECT u_id FROM questions WHERE q_id = ?', [questionId], (err, results) => {
    if (err || results.length === 0) {
      res.status(404).json({ error: 'Question not found or user not associated' });
      return;
    }

    const questionOwnerUsername = results[0].u_id;
    console.log('Question owner:', questionOwnerUsername);
    if (questionOwnerUsername !== loggedInUsername) {
      res.status(403).json({ error: 'Unauthorized to delete this question' });
      return;
    }

    // If the logged-in user is the owner, proceed with the deletion
    db.query('DELETE FROM questions WHERE q_id = ?', [questionId], (err, deleteResult) => {
      if (err) {
        res.status(500).json({ error: 'Failed to delete question' });
        return;
      }
      
      res.status(200).json({ message: 'Question deleted successfully' });
    });
  });
});

app.get('/top-tags', (req, res) => {
  const TOP_TAGS_QUERY = 'SELECT t_name FROM tags ORDER BY count DESC LIMIT 20';
  db.query(TOP_TAGS_QUERY, (err, results) => {
    if (err) {
      console.error('Error fetching top tags:', err);
      res.status(500).send('Error fetching top tags from database');
      return;
    }
    res.json(results); // Send the top tags as JSON response
  });
});

app.get('/questions-by-tag', (req, res) => {
  const tag = req.query.tag;
  if (!tag) {
    return res.status(400).send('Tag is required');
  }

  const QUESTIONS_BY_TAG_QUERY = `
    SELECT * FROM questions 
    WHERE t_name LIKE CONCAT('%', ?, '%')
  `;

  db.query(QUESTIONS_BY_TAG_QUERY, [tag], (err, results) => {
    if (err) {
      console.error('Error fetching questions by tag:', err);
      res.status(500).send('Error fetching questions by tag from database');
      return;
    }
    res.json(results);
  });
});

app.get('/question-details', (req, res) => {
  const questionId = req.query.id; // Extract the question ID from the query parameter
  
  // Query to fetch question details, answers, and comments based on the question ID
  const QUESTION_DETAILS_QUERY = `
  SELECT
  q.q_id,
  q.title AS question_title,
  q.q_body AS question_body,
  q.q_creation_date AS question_creation_date,
  u.u_id AS user_id,
  u.u_name AS username,
  u.reputation AS user_reputation,
  GROUP_CONCAT(DISTINCT a.a_id) AS answer_ids,
  GROUP_CONCAT(DISTINCT a.a_body SEPARATOR ']') AS answers,
  GROUP_CONCAT(DISTINCT c.c_id) AS comment_ids,
  GROUP_CONCAT(DISTINCT c.text SEPARATOR ']') AS comments
  FROM questions q
  JOIN users u ON q.u_id = u.u_id
  LEFT JOIN answers a ON q.q_id = a.q_id
  LEFT JOIN comments c ON q.q_id = c.q_id
  WHERE q.q_id = ?
  GROUP BY q.q_id, q.title, q.q_body, q.q_creation_date, u.u_id, u.u_name;
  `;

  db.query(QUESTION_DETAILS_QUERY, [questionId], (err, results) => {
    if (err) {
      console.error('Error fetching question details:', err);
      res.status(500).send('Error fetching question details from the database');
      return;
    }

    if (results.length === 0) {
      res.status(404).send('Question not found');
      return;
    }

    const questionDetails = results[0]; // Assuming the query returns a single row

    // Send the retrieved question details as JSON response
    res.json(questionDetails);
  });
});

app.post('/like-question/:questionId', (req, res) => {
  const questionId = req.params.questionId;

  // Retrieve the user_id of the question owner from the database
  const GET_QUESTION_OWNER_QUERY = 'SELECT u_id FROM questions WHERE q_id = ?';
  db.query(GET_QUESTION_OWNER_QUERY, [questionId], (err, ownerResult) => {
    if (err || ownerResult.length === 0) {
      console.error('Error fetching question owner:', err);
      res.status(500).send('Error fetching question owner');
      return;
    }

    const ownerId = ownerResult[0].u_id;

    // Use the retrieved user_id to update the user's reputation in the users table
    const UPDATE_USER_REPUTATION_QUERY = 'UPDATE users SET reputation = reputation + 1 WHERE u_id = ?';
    db.query(UPDATE_USER_REPUTATION_QUERY, [ownerId], (err, reputationResult) => {
      if (err) {
        console.error('Error updating user reputation:', err);
        res.status(500).send('Error updating user reputation');
        return;
      }

      res.status(200).send('Question liked successfully');
    });
  });
});

app.post('/like-comment/:commentId', (req, res) => {
  const commentId = req.params.commentId;

  // Retrieve the user_id of the comment owner from the database
  const GET_COMMENT_OWNER_QUERY = 'SELECT u_id FROM comments WHERE c_id = ?';
  db.query(GET_COMMENT_OWNER_QUERY, [commentId], (err, ownerResult) => {
    if (err || ownerResult.length === 0) {
      console.error('Error fetching comment owner:', err);
      res.status(500).send('Error fetching comment owner');
      return;
    }

    const ownerId = ownerResult[0].u_id;

    // Use the retrieved user_id to update the user's reputation in the users table
    const UPDATE_USER_REPUTATION_QUERY = 'UPDATE users SET reputation = reputation + 1 WHERE u_id = ?';
    db.query(UPDATE_USER_REPUTATION_QUERY, [ownerId], (err, reputationResult) => {
      if (err) {
        console.error('Error updating user reputation:', err);
        res.status(500).send('Error updating user reputation');
        return;
      }

      res.status(200).send('Comment liked successfully');
    });
  });
});


app.post('/like-answer/:answerId', (req, res) => {
  const answerId = req.params.answerId;

  // Retrieve the user_id of the answer owner from the database
  const GET_ANSWER_OWNER_QUERY = 'SELECT u_id FROM answers WHERE a_id = ?';
  db.query(GET_ANSWER_OWNER_QUERY, [answerId], (err, ownerResult) => {
    if (err || ownerResult.length === 0) {
      console.error('Error fetching answer owner:', err);
      res.status(500).send('Error fetching answer owner');
      return;
    }

    const ownerId = ownerResult[0].u_id;

    // Use the retrieved user_id to update the user's reputation in the users table
    const UPDATE_USER_REPUTATION_QUERY = 'UPDATE users SET reputation = reputation + 1 WHERE u_id = ?';
    db.query(UPDATE_USER_REPUTATION_QUERY, [ownerId], (err, reputationResult) => {
      if (err) {
        console.error('Error updating user reputation:', err);
        res.status(500).send('Error updating user reputation');
        return;
      }

      res.status(200).send('Answer liked successfully');
    });
  });
});


app.get('/top_answers', (req, res) => {
  const CALL_PROCEDURE_QUERY = 'CALL GetTopAnswersWithTotalCount(@total_records_count)';
  
  db.query(CALL_PROCEDURE_QUERY, (err, results) => { 
    if (err) {
      console.error('Error calling stored procedure:', err);
      res.status(500).send('Error calling stored procedure');
      return;
    }

    const SELECT_TOTAL_COUNT_QUERY = 'SELECT @total_records_count AS total_records_count';
    db.query(SELECT_TOTAL_COUNT_QUERY, (err, totalCountResult) => {
      if (err) {
        console.error('Error fetching total count:', err);
        res.status(500).send('Error fetching total count from database');
        return;
      }

      const totalCount = totalCountResult[0].total_records_count;
      const resultSet = results; // Assuming the result set is in the first element

      res.json({
        result: resultSet,
        totalCount: totalCount,
      });
    });
  });
});


app.post('/post-answer/:questionId', (req, res) => {
  // Ensure the user is logged in
  if (!req.session.username) {
    res.status(401).send('You must be logged in to post an answer');
    return;
  }

  const questionId = req.params.questionId;
  const { answerText } = req.body;
  const userId = req.session.username; // Logged-in user's ID from the session

  // Validate input
  if (!answerText) {
    res.status(400).send('Answer text is required');
    return;
  }

  // Find the largest current answer_id
  const FIND_LARGEST_ANSWER_ID_QUERY = 'SELECT MAX(CAST(a_id AS UNSIGNED)) AS max_answer_id FROM answers';
  db.query(FIND_LARGEST_ANSWER_ID_QUERY, (err, results) => {
    if (err) {
      console.error('Error finding the largest answer_id:', err);
      res.status(500).send('Error finding the largest answer_id in database');
      return;
    }

    const maxAnswerId = results[0].max_answer_id || 0;
    const newAnswerNumericId = maxAnswerId + 1;

    // Insert new answer
    const INSERT_ANSWER_QUERY = 'INSERT INTO answers (a_id, a_body, a_creation_date, q_id, u_id) VALUES (?, ?, NOW(), ?, ?)';
    db.query(INSERT_ANSWER_QUERY, [newAnswerNumericId.toString(), answerText, questionId, userId], (err) => {
      if (err) {
        console.error('Error adding answer:', err);
        res.status(500).send('Error adding answer to database');
      } else {
        console.log('Answer added successfully');
        res.status(200).send('Answer added successfully');
      }
    });
  });
});




app.get('/', (req, res) => {
  res.send('Hello, this is your Node.js app!');
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});