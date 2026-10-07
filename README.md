# audio2.0

A.U.D.I.O. is a college demonstration system for AI-assisted speech anti-spoofing. It uses the official AASIST architecture and requires a compatible pretrained checkpoint. It does not fabricate model output or claim that a genuine result proves identity.

## Requirements

- Python 3.12+
- Node.js 20+
- PyTorch and the AASIST model dependencies from `backend/requirements.txt`
- A compatible AASIST checkpoint in `models/aasist/models/weights/`

## Run

1. Install backend dependencies:
   ```powershell
   cd backend
   python -m pip install -r requirements.txt
   ```
2. Install frontend dependencies:
   ```powershell
   cd frontend
   npm install
   ```
3. Set `AASIST_CHECKPOINT` to the compatible checkpoint path if it is outside the default location.
4. Start the backend:
   ```powershell
   cd backend
   python -m uvicorn app.main:app --reload
   ```
5. Start the frontend:
   ```powershell
   cd frontend
   npm run dev
   ```

## Model safety

The application refuses to run inference when the checkpoint is missing, invalid, or does not match the AASIST architecture. The UI explicitly displays `DETECTION MODEL NOT LOADED` and does not create synthetic confidence values.

## Testing

```powershell
cd backend
python -m pytest -q
cd ../frontend
npm run build
```

## Privacy

Raw audio is not stored by default. Detection history stores metadata only. The live microphone interface is a local demonstration and does not intercept third-party calls.
