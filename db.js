// db.js

var mysql = require('mysql');

var connection = mysql.createConnection({
    host: '34.29.125.63',
    //host: '/cloudsql/cs411-pt1-stage3-402920:us-central1:cs411-db-s3',
    //socketPath: '/cs411-pt1-stage3-402920:us-central1:cs411-db-s3',
    user: 'root',
    password: 'namesaredumb',
    database: 'courseoverflow'
});


connection.connect((err) => {
    if (err) {
      console.error('Error connecting to database:', err);
      return;
    }
    console.log('Connected to MySQL database!');
  
    // Create users2 table if it doesn't exist
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS users2 (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL
      )
    `;
  
    connection.query(createTableQuery, (err, result) => {
      if (err) {
        console.error('Error creating table:', err);
        return;
      }
      console.log('Users2 table created or already exists');
    });
  });
  
module.exports = connection;
