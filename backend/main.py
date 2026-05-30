# FastAPI entry point — registers all routers and configures CORS for the Next.js frontend.
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.upload import router as upload_router
from routers.courses import router as courses_router

app = FastAPI(title="Oris API")

port = int(os.environ.get("PORT", 8000))

origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(upload_router)
app.include_router(courses_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
