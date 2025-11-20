# **MongoDB Setup for Video Processing Microservice**  

This guide helps in setting up the **MongoDB database** for the **Video Upload & Processing Microservice**.  

## ✅ **2️⃣ Create the Database in MongoDB Compass**  
1. Open **MongoDB Compass**.  
2. Click **"Connect"** and connect to:  
   ```
   mongodb://localhost:27017
   ```  
3. Click **"Create Database"**, enter:  
   - **Database Name:** `mediastream`  
   - **Collection Name:** `videos`  
4. Use the **"Query"** tab to execute the following MongoDB commands.  

---

## 📌 **3️⃣ Create Collections & Schema in MongoDB**  

### 🎥 **`videos` Collection** _(Stores Video Metadata & Processing Status)_  
```json
db.videos.insertOne({
  "videoID": "EVSOA0101_1",
  "projectID": "EVSOA0101",
  "fileName": "video.mp4",
  "filePath": "ev-soa/EVSOA0101/org/video.mp4",
  "masterFilePath": "ev-soa/EVSOA0101/converted/video/master.m3u8",
  "fileSize": 104857600,
  "converted": false,
  "uploadTime": new Date(),
  "resolutions": ["240p", "360p", "480p", "720p", "1080p"],
  "processingStatus": {
    "240p": "pending",
    "360p": "pending",
    "480p": "pending",
    "720p": "pending",
    "1080p": "pending"
  }
})
```  

---

### 📌 **`projects` Collection** _(Tracks Last Video Count for Each Project)_  
```json
db.projects.insertOne({
  "projectID": "EVSOA0101",
  "lastVideoCount": 1
})
```  

---

### 📌 **`upload_logs` Collection** _(Logs Video Uploads & Processing)_  
```json
db.upload_logs.insertOne({
  "videoID": "EVSOA0101_1",
  "projectID": "EVSOA0101",
  "logType": "upload",
  "message": "Video uploaded successfully",
  "details": "File Size: 100MB",
  "createdAt": new Date()
})
```  

---

### 📌 **`stream_logs` Collection** _(Tracks Video Demand & User Details)_  
```json
db.stream_logs.insertOne({
  "videoID": "EVSOA0101_1",
  "projectID": "EVSOA0101",
  "userIP": "192.168.1.100",
  "userAgent": "Mozilla/5.0",
  "timestamp": new Date()
})
```  

---

### 📌 **`api_keys` Collection** _(Manages API Keys for Authentication)_  
```json
db.api_keys.insertOne({
  "apiKey": "6f568c7ebab5eb21f4c66df0c451869e31652b6ade6851b55db83d0ac792dbb3",
  "createdAt": new Date(),
  "isActive": true
})
db.api_keys.insertOne({
  "apiKey": "test-key-evsoa",
  "createdAt": new Date(),
  "isActive": true
})
```  

---

### 📌 **`admins` Collection** _(Manages Admins & Their Permissions)_  
```json
db.admins.insertOne({
  "adminID": "edulyst_evsoa",
  "email": "naman.jain@edulystventures.com",
  "passwordHash": "Thenasu8@",
  "role": "super_admin",
  "projectID": "EVSOA0101",
  "createdAt": new Date()
})

db.admins.insertOne({
  "adminID": "naman_jain",
  "email": "naman.jain@edulystventures.com",
  "passwordHash": "Thenasu8@",
  "role": "project_admin",
  "projectID": "EVSOA0101",
  "createdAt": new Date()
})
```  
#### 🎯 **Role Options:**  
- `"super_admin"` → Access to all projects  
- `"project_admin"` → Access to only one project  

---

## ✅ **4️⃣ Set Up `.env` File for MongoDB in Your Node.js Code**  
Create a `.env` file in your project root directory:  
```
MONGO_URI=mongodb://localhost:27017/mediastream
```  
For **cloud-based MongoDB Atlas**, use:  
```
MONGO_URI=mongodb+srv://your_username:your_password@your-cluster.mongodb.net/mediastream?retryWrites=true&w=majority
```  

---

## ✅ **5️⃣ Verify the Database**  

### 🖥️ **Open MongoDB Shell**  
Run:  
```sh
mongosh
```  

### 📌 **Check the Database**  
```sh
use mediastream
show collections
```  
Expected Output:  
```
videos
projects
upload_logs
stream_logs
api_keys
admins
```  

---

## 📌 **6️⃣ Create Indexes for Performance Optimization**  

```sh
db.videos.createIndex({ videoID: 1 }, { unique: true });
db.videos.createIndex({ projectID: 1 });
db.videos.createIndex({ projectID: 1, uploadTime: -1 });

db.projects.createIndex({ projectID: 1 }, { unique: true });

db.upload_logs.createIndex({ videoID: 1, createdAt: -1 });

db.stream_logs.createIndex({ videoID: 1, userIP: 1, timestamp: -1 });

db.api_keys.createIndex({ apiKey: 1 }, { unique: true });

db.admins.createIndex({ adminID: 1, role: 1, projectID: 1 });
```  

### ✅ **Check Created Indexes**  
```sh
db.videos.getIndexes()
db.projects.getIndexes()
db.upload_logs.getIndexes()
db.stream_logs.getIndexes()
db.api_keys.getIndexes()
db.admins.getIndexes()
```  

---

## 🚀 **Next Steps**  
1. Set up **MongoDB Atlas** or local MongoDB.  
2. Configure the `.env` file in the backend service.  
3. Run `mongosh` and verify the database setup.  
4. Deploy the microservice.  

🎯 **Now MongoDB is ready for production!** 🚀

 db.videos.deleteMany({})
 db.upload_logs.deleteMany({})
 db.stream_logs.deleteMany({})


 <!-- change the project count to zero or create new project -->
 db.projects.updateOne(
  { "projectID": "EVSOA0101" }, 
  { $set: { "lastVideoCount": 0 } },
  { upsert: true }
)


for going in docker 

sudo docker exec -it mongodb mongosh
