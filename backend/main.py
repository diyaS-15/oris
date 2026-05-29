# FastAPI entry point — registers all routers and configures CORS for the Next.js frontend.
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.upload import router as upload_router
from routers.courses import router as courses_router

app = FastAPI(title="Oris API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(upload_router)
app.include_router(courses_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
