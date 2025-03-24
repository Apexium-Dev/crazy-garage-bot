# WhatsApp Gallery Bot

A WhatsApp bot that allows users to submit before/after photos of car detailing work. The bot supports multiple languages (English, Macedonian, and Albanian) and automatically uploads processed images to a GitHub repository.

## Features

- Multi-language support (English, Macedonian, Albanian)
- Interactive conversation flow
- Automatic image processing and optimization
- GitHub integration for image storage
- Secure environment variable handling

## Prerequisites

- Node.js (v14 or higher)
- WhatsApp Business API access
- GitHub account with repository access
- ngrok or similar tool for webhook development

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```
   WHATSAPP_TOKEN=your_whatsapp_token_here
   VERIFY_TOKEN=your_verify_token_here
   GITHUB_TOKEN=your_github_token_here
   PORT=3000
   ```

## Environment Variables

- `WHATSAPP_TOKEN`: Your WhatsApp Business API token
- `VERIFY_TOKEN`: Custom token for webhook verification
- `GITHUB_TOKEN`: GitHub Personal Access Token with repo permissions
- `PORT`: Server port (default: 3000)

## Running the Bot

1. Start the server:
   ```bash
   node index.js
   ```
2. Use ngrok to expose your local server:
   ```bash
   ngrok http 3000
   ```
3. Configure your WhatsApp webhook URL with the ngrok URL

## Usage Flow

1. User sends a message to the WhatsApp number
2. Bot responds with language selection
3. User selects language
4. Bot guides user through:
   - Entering title
   - Entering description
   - Uploading before photo
   - Uploading after photo
5. Bot processes and uploads images to GitHub

## Security Notes

- Keep your `.env` file secure and never commit it to version control
- Regularly rotate your access tokens
- Monitor GitHub's security alerts 