const express = require('express');
const dotenv = require('dotenv');
const multer = require('multer');
const sharp = require('sharp');
const { Octokit } = require('@octokit/rest');
const i18next = require('i18next');
const fetch = require('node-fetch');

dotenv.config();

const app = express();
app.use(express.json());

// Add health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WhatsApp API Configuration
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = '601831163014385';

// GitHub Configuration
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

// User state management
const userStates = new Map();

const States = {
  INIT: 'INIT',
  LANGUAGE_SELECTED: 'LANGUAGE_SELECTED',
  WAITING_TITLE: 'WAITING_TITLE',
  WAITING_DESCRIPTION: 'WAITING_DESCRIPTION',
  WAITING_BEFORE_PHOTO: 'WAITING_BEFORE_PHOTO',
  WAITING_AFTER_PHOTO: 'WAITING_AFTER_PHOTO'
};

// Configure multer for handling file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Initialize i18next
i18next.init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        welcome: 'Welcome! Please select your language:\n1. English\n2. Macedonian\n3. Albanian',
        askTitle: 'Please enter the title for your work:',
        askDescription: 'Please enter the description:',
        askBeforePhoto: 'Please send the BEFORE photo:',
        askAfterPhoto: 'Please send the AFTER photo:',
        success: 'Successfully uploaded your work!',
        invalidLanguage: 'Please select a valid language (1, 2, or 3)',
        processing: 'Processing your request...'
      }
    },
    mk: {
      translation: {
        welcome: 'Добредојдовте! Изберете јазик:\n1. Англиски\n2. Македонски\n3. Албански',
        askTitle: 'Внесете наслов за вашата работа:',
        askDescription: 'Внесете опис:',
        askBeforePhoto: 'Испратете ја ПРЕД фотографијата:',
        askAfterPhoto: 'Испратете ја ПОСЛЕ фотографијата:',
        success: 'Успешно прикачена вашата работа!',
        invalidLanguage: 'Изберете валиден јазик (1, 2, или 3)',
        processing: 'Ја процесираме вашата барање...'
      }
    },
    sq: {
      translation: {
        welcome: 'Mirë se vini! Zgjidhni gjuhën tuaj:\n1. Anglisht\n2. Maqedonisht\n3. Shqip',
        askTitle: 'Ju lutemi shkruani titullin e punës suaj:',
        askDescription: 'Ju lutemi shkruani përshkrimin:',
        askBeforePhoto: 'Ju lutemi dërgoni foton PARA:',
        askAfterPhoto: 'Ju lutemi dërgoni foton PAS:',
        success: 'Puna juaj u ngarkua me sukses!',
        invalidLanguage: 'Ju lutemi zgjidhni një gjuhë të vlefshme (1, 2, ose 3)',
        processing: 'Duke përpunuar kërkesën tuaj...'
      }
    }
  }
});

// Function to send WhatsApp messages
async function sendWhatsAppMessage(to, message) {
  try {
    const response = await fetch(`https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: message }
      })
    });
    
    if (!response.ok) {
      throw new Error(`WhatsApp API error: ${response.status}`);
    }
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
  }
}

// Function to download media from WhatsApp
async function downloadMedia(mediaId) {
  try {
    const response = await fetch(`https://graph.facebook.com/v17.0/${mediaId}`, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get media URL: ${response.status}`);
    }

    const data = await response.json();
    const mediaResponse = await fetch(data.url, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`
      }
    });

    if (!mediaResponse.ok) {
      throw new Error(`Failed to download media: ${mediaResponse.status}`);
    }

    return await mediaResponse.buffer();
  } catch (error) {
    console.error('Error downloading media:', error);
    throw error;
  }
}

// Function to upload to GitHub
async function uploadToGitHub(imageBuffer, filename, title, description, language) {
  try {
    // Convert image to WebP format and resize
    const processedImage = await sharp(imageBuffer)
      .resize(1920, null, { withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    // Convert buffer to base64
    const content = processedImage.toString('base64');

    // Upload to GitHub
    const response = await octokit.repos.createOrUpdateFileContents({
      owner: 'Apexium-Dev',
      repo: 'crazy-garage',
      path: `public/gallery/${filename}.webp`,
      message: `Add: ${title} - ${description}`,
      content: content,
      branch: 'main'
    });

    return response.data;
  } catch (error) {
    console.error('Error uploading to GitHub:', error);
    throw error;
  }
}

// Webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
      console.log('Webhook verified');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Handle incoming messages
app.post('/webhook', async (req, res) => {
  try {
    const { entry } = req.body;

    if (!entry || !entry[0].changes || !entry[0].changes[0].value.messages) {
      return res.sendStatus(200);
    }

    const message = entry[0].changes[0].value.messages[0];
    const sender = message.from;
    
    // Initialize user state if not exists
    if (!userStates.has(sender)) {
      userStates.set(sender, {
        state: States.INIT,
        language: 'en',
        data: {}
      });
      await sendWhatsAppMessage(sender, i18next.t('welcome', { lng: 'en' }));
      return res.sendStatus(200);
    }

    const userState = userStates.get(sender);

    // Handle different states
    switch (userState.state) {
      case States.INIT:
        if (message.type === 'text') {
          const choice = message.text.body.trim();
          const languages = ['en', 'mk', 'sq'];
          if (['1', '2', '3'].includes(choice)) {
            userState.language = languages[parseInt(choice) - 1];
            userState.state = States.WAITING_TITLE;
            await sendWhatsAppMessage(sender, i18next.t('askTitle', { lng: userState.language }));
          } else {
            await sendWhatsAppMessage(sender, i18next.t('invalidLanguage', { lng: userState.language }));
          }
        }
        break;

      case States.WAITING_TITLE:
        if (message.type === 'text') {
          userState.data.title = message.text.body;
          userState.state = States.WAITING_DESCRIPTION;
          await sendWhatsAppMessage(sender, i18next.t('askDescription', { lng: userState.language }));
        }
        break;

      case States.WAITING_DESCRIPTION:
        if (message.type === 'text') {
          userState.data.description = message.text.body;
          userState.state = States.WAITING_BEFORE_PHOTO;
          await sendWhatsAppMessage(sender, i18next.t('askBeforePhoto', { lng: userState.language }));
        }
        break;

      case States.WAITING_BEFORE_PHOTO:
        if (message.type === 'image') {
          const beforePhoto = await downloadMedia(message.image.id);
          userState.data.beforePhoto = beforePhoto;
          userState.state = States.WAITING_AFTER_PHOTO;
          await sendWhatsAppMessage(sender, i18next.t('askAfterPhoto', { lng: userState.language }));
        }
        break;

      case States.WAITING_AFTER_PHOTO:
        if (message.type === 'image') {
          const afterPhoto = await downloadMedia(message.image.id);
          userState.data.afterPhoto = afterPhoto;
          
          // Process and upload both photos
          await sendWhatsAppMessage(sender, i18next.t('processing', { lng: userState.language }));
          
          const timestamp = Date.now();
          await uploadToGitHub(
            userState.data.beforePhoto,
            `before_${timestamp}`,
            userState.data.title,
            userState.data.description,
            userState.language
          );
          
          await uploadToGitHub(
            userState.data.afterPhoto,
            `after_${timestamp}`,
            userState.data.title,
            userState.data.description,
            userState.language
          );

          // Reset user state
          userStates.delete(sender);
          await sendWhatsAppMessage(sender, i18next.t('success', { lng: userState.language }));
        }
        break;
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 