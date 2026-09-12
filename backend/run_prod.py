import logging
from waitress import serve
from app import app

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s")
logger = logging.getLogger(__name__)

if __name__ == '__main__':
    logger.info("Starting production server with Waitress on 0.0.0.0:8001 (multi-threaded)")
    # Waitress will automatically use multiple threads to handle concurrent requests
    serve(app, host='0.0.0.0', port=8001, threads=8)
