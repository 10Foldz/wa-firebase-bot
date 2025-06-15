
# WA Firebase Bot

This project is a WhatsApp bot powered by Firebase. It is designed to work with Firebase Functions and other Firebase services to interact with WhatsApp.

## Requirements

Before running this project, ensure you have the following installed on your machine:

- [Node.js](https://nodejs.org/en/) (v12.x or above)
- [Firebase CLI](https://firebase.google.com/docs/cli) (Install it via `npm install -g firebase-tools`)
- [Git](https://git-scm.com/)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-repository/wa-firebase-bot.git
   cd wa-firebase-bot-main
   ```

3. Install the project dependencies:
   ```bash
   npm install axios dotenv express firebase-admin firebase-functions form-data twilio
   ```

## Setup Firebase

1. Authenticate with Firebase:
   ```bash
   firebase login
   ```

2. Initialize Firebase project:
   ```bash
   firebase init
   ```

   - Select Firebase Functions.
   - Use an existing Firebase project or create a new one.

3. Set up the environment for Firebase Functions:
   - Set up the necessary Firebase services (such as Firestore, Firebase Authentication, etc.) if they are required for the bot.

## Notes

- Make sure you have set up the correct Firebase project and API keys.
- Check the `index.js` in the `functions` directory for Firebase Functions logic.
- Modify environment variables as needed for WhatsApp API connections.
