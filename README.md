# 🌾 मेरा गाँव - ग्राम पंचायत एवं सरपंच पोर्टल (Node.js)

आपकी डिज़ाइन की सभी **8 स्क्रीन** के अनुसार तैयार किया गया संपूर्ण, आधुनिक और इंटरएक्टिव **ग्राम पंचायत एवं सरपंच वेब पोर्टल**।

---

## 🚀 एकीकृत एडमिन पैनल URL (Single Unified URL)

अब सभी 8 स्क्रीन्स और सभी फीचर्स **एक ही मुख्य एडमिन यूआरएल** पर उपलब्ध हैं:

👉 **मुख्य एडमिन पैनल यूआरएल**: **[http://localhost:3000/admin](http://localhost:3000/admin)**

इस सिंगल URL के अंदर आप साइडबार या टैब से सभी 8 स्क्रीन्स तुरंत एक्सेस कर सकते हैं:
1. 🔒 **डैशबोर्ड (स्क्रीन 7)**: `http://localhost:3000/admin?tab=dashboard`
2. 👥 **उम्मीदवार सूची (स्क्रीन 2) व उम्मीदवार प्रोफाइल (स्क्रीन 3)**: `http://localhost:3000/admin?tab=candidates`
3. 🏗️ **ग्राम विकास कार्य प्रबंधन (स्क्रीन 8), गैलरी (स्क्रीन 5) व कार्य विवरण (स्क्रीन 4)**: `http://localhost:3000/admin?tab=works`
4. 🎯 **सरपंच के कर्तव्य व भविष्य योजना (स्क्रीन 6)**: `http://localhost:3000/admin?tab=duties`
5. 📩 **नागरिक शिकायतें एवं सुझाव**: `http://localhost:3000/admin?tab=complaints`
6. 📈 **विज़िटर एनालिटिक्स**: `http://localhost:3000/admin?tab=analytics`
7. ⚙️ **पंचायत सेटिंग्स**: `http://localhost:3000/admin?tab=settings`

---

## 🌐 सार्वजनिक वेबसाइट यूआरएल (Public Website)
- **Home**: [http://localhost:3000/](http://localhost:3000/)

---

## 🔑 एडमिन लॉगिन क्रेडेंशियल (Demo Login)

- **Login URL**: [http://localhost:3000/admin/login](http://localhost:3000/admin/login)
- **Username**: `admin`
- **Password**: `admin123`

---

## 🛠️ प्रोजेक्ट कैसे चलाएं (Run Locally)

1. प्रोजेक्ट डायरेक्टरी में जाएं:
   ```bash
   cd c:\Users\kanod\Desktop\sarpanch
   ```
2. डिपेंडेंसी इंस्टॉल करें:
   ```bash
   npm install
   ```
3. सर्वर स्टार्ट करें:
   ```bash
   npm start
   # या डेवलपमेंट मोड (Auto-reload) के लिए:
   npm run dev
   ```
4. ब्राउज़र में ओपन करें:
   👉 **वेबसाइट**: [http://localhost:3000/](http://localhost:3000/)  
   👉 **एडमिन पैनल**: [http://localhost:3000/admin](http://localhost:3000/admin)

---

## 📦 तकनीकी संरचना (Tech Stack)

- **Backend**: Node.js, Express.js
- **Templating**: EJS (Server-side rendering)
- **Database / Storage**: `data/db.json` (जीरो कॉन्फ़िगरेशन, ऑटो-सेविंग JSON डेटाबेस)
- **Styling**: कस्टम आधुनिक CSS3 (Google Fonts Noto Sans Devanagari + Poppins, रिस्पॉन्सिव ग्रिड, फ्लेक्सबॉक्स)
- **Interactivity**: AJAX लाइव वोट समर्थन काउंटर, रियल-टाइम सर्च व फ़िल्टरिंग, मॉडल डायलॉग्स
