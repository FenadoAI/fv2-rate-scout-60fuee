from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import aiohttp
import asyncio

# AI agents
from ai_agents.agents import AgentConfig, SearchAgent, ChatAgent


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# AI agents init
agent_config = AgentConfig()
search_agent: Optional[SearchAgent] = None
chat_agent: Optional[ChatAgent] = None

# Main app
app = FastAPI(title="AI Agents API", description="Minimal AI Agents API with LangGraph and MCP support")

# API router
api_router = APIRouter(prefix="/api")


# Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str


# AI agent models
class ChatRequest(BaseModel):
    message: str
    agent_type: str = "chat"  # "chat" or "search"
    context: Optional[dict] = None


class ChatResponse(BaseModel):
    success: bool
    response: str
    agent_type: str
    capabilities: List[str]
    metadata: dict = Field(default_factory=dict)
    error: Optional[str] = None


class SearchRequest(BaseModel):
    query: str
    max_results: int = 5


class SearchResponse(BaseModel):
    success: bool
    query: str
    summary: str
    search_results: Optional[dict] = None
    sources_count: int
    error: Optional[str] = None


# Hyperliquid models
class MarketData(BaseModel):
    symbol: str
    mark_price: float
    funding_rate: float
    open_interest: float
    premium: float
    day_volume: float
    price_change_24h: float = 0.0


class FundingArbitrageResponse(BaseModel):
    success: bool
    markets: List[MarketData]
    total_markets: int
    filtered_markets: int
    highest_funding_rate: Optional[MarketData] = None
    last_updated: datetime
    error: Optional[str] = None

# Hyperliquid API functions
async def fetch_hyperliquid_data():
    """Fetch market data from Hyperliquid API"""
    url = "https://api.hyperliquid.xyz/info"
    payload = {"type": "metaAndAssetCtxs"}

    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload) as response:
            if response.status == 200:
                data = await response.json()
                return data
            else:
                raise HTTPException(status_code=500, detail=f"Failed to fetch Hyperliquid data: {response.status}")


def parse_market_data(hyperliquid_data) -> List[MarketData]:
    """Parse Hyperliquid API response into MarketData objects"""
    markets = []

    if not hyperliquid_data or len(hyperliquid_data) < 2:
        return markets

    universe = hyperliquid_data[0].get("universe", [])
    asset_contexts = hyperliquid_data[1] if len(hyperliquid_data) > 1 else []

    for i, asset_ctx in enumerate(asset_contexts):
        if i < len(universe):
            symbol = universe[i]["name"]

            try:
                # Parse market data with safe float conversion
                mark_price = float(asset_ctx.get("markPx") or "0")
                funding_rate = float(asset_ctx.get("funding") or "0")
                open_interest = float(asset_ctx.get("openInterest") or "0")
                premium = float(asset_ctx.get("premium") or "0")
                day_volume = float(asset_ctx.get("dayNtlVlm") or "0")
                prev_day_price = float(asset_ctx.get("prevDayPx") or "0")

                # Calculate 24h price change
                price_change_24h = 0.0
                if prev_day_price > 0 and mark_price > 0:
                    price_change_24h = ((mark_price - prev_day_price) / prev_day_price) * 100

                markets.append(MarketData(
                    symbol=symbol,
                    mark_price=mark_price,
                    funding_rate=funding_rate,
                    open_interest=open_interest,
                    premium=premium,
                    day_volume=day_volume,
                    price_change_24h=price_change_24h
                ))
            except (ValueError, TypeError) as e:
                logger.warning(f"Error parsing data for {symbol}: {e}")
                continue

    return markets


# Routes
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]


# AI agent routes
@api_router.post("/chat", response_model=ChatResponse)
async def chat_with_agent(request: ChatRequest):
    # Chat with AI agent
    global search_agent, chat_agent
    
    try:
        # Init agents if needed
        if request.agent_type == "search" and search_agent is None:
            search_agent = SearchAgent(agent_config)
            
        elif request.agent_type == "chat" and chat_agent is None:
            chat_agent = ChatAgent(agent_config)
        
        # Select agent
        agent = search_agent if request.agent_type == "search" else chat_agent
        
        if agent is None:
            raise HTTPException(status_code=500, detail="Failed to initialize agent")
        
        # Execute agent
        response = await agent.execute(request.message)
        
        return ChatResponse(
            success=response.success,
            response=response.content,
            agent_type=request.agent_type,
            capabilities=agent.get_capabilities(),
            metadata=response.metadata,
            error=response.error
        )
        
    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}")
        return ChatResponse(
            success=False,
            response="",
            agent_type=request.agent_type,
            capabilities=[],
            error=str(e)
        )


@api_router.post("/search", response_model=SearchResponse)
async def search_and_summarize(request: SearchRequest):
    # Web search with AI summary
    global search_agent
    
    try:
        # Init search agent if needed
        if search_agent is None:
            search_agent = SearchAgent(agent_config)
        
        # Search with agent
        search_prompt = f"Search for information about: {request.query}. Provide a comprehensive summary with key findings."
        result = await search_agent.execute(search_prompt, use_tools=True)
        
        if result.success:
            return SearchResponse(
                success=True,
                query=request.query,
                summary=result.content,
                search_results=result.metadata,
                sources_count=result.metadata.get("tools_used", 0)
            )
        else:
            return SearchResponse(
                success=False,
                query=request.query,
                summary="",
                sources_count=0,
                error=result.error
            )
            
    except Exception as e:
        logger.error(f"Error in search endpoint: {e}")
        return SearchResponse(
            success=False,
            query=request.query,
            summary="",
            sources_count=0,
            error=str(e)
        )


@api_router.get("/funding-arbitrage", response_model=FundingArbitrageResponse)
async def get_funding_arbitrage():
    """
    Get funding arbitrage opportunities from Hyperliquid
    Filters for markets with >$50M USD open interest and sorts by funding rate
    """
    try:
        # Fetch data from Hyperliquid
        hyperliquid_data = await fetch_hyperliquid_data()

        # Parse market data
        all_markets = parse_market_data(hyperliquid_data)

        # Filter for USD value of open interest > $50M
        MIN_USD_OPEN_INTEREST = 50_000_000  # $50M USD
        filtered_markets = [
            market for market in all_markets
            if (market.open_interest * market.mark_price) > MIN_USD_OPEN_INTEREST
        ]

        # Sort by funding rate (highest first)
        filtered_markets.sort(key=lambda x: x.funding_rate, reverse=True)

        # Find highest funding rate
        highest_funding = filtered_markets[0] if filtered_markets else None

        logger.info(f"Found {len(filtered_markets)} markets with >$50M USD open interest out of {len(all_markets)} total")

        return FundingArbitrageResponse(
            success=True,
            markets=filtered_markets,
            total_markets=len(all_markets),
            filtered_markets=len(filtered_markets),
            highest_funding_rate=highest_funding,
            last_updated=datetime.utcnow()
        )

    except Exception as e:
        logger.error(f"Error fetching funding arbitrage data: {e}")
        return FundingArbitrageResponse(
            success=False,
            markets=[],
            total_markets=0,
            filtered_markets=0,
            last_updated=datetime.utcnow(),
            error=str(e)
        )


@api_router.get("/agents/capabilities")
async def get_agent_capabilities():
    # Get agent capabilities
    try:
        capabilities = {
            "search_agent": SearchAgent(agent_config).get_capabilities(),
            "chat_agent": ChatAgent(agent_config).get_capabilities()
        }
        return {
            "success": True,
            "capabilities": capabilities
        }
    except Exception as e:
        logger.error(f"Error getting capabilities: {e}")
        return {
            "success": False,
            "error": str(e)
        }

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging config
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    # Initialize agents on startup
    global search_agent, chat_agent
    logger.info("Starting AI Agents API...")
    
    # Lazy agent init for faster startup
    logger.info("AI Agents API ready!")


@app.on_event("shutdown")
async def shutdown_db_client():
    # Cleanup on shutdown
    global search_agent, chat_agent
    
    # Close MCP
    if search_agent and search_agent.mcp_client:
        # MCP cleanup automatic
        pass
    
    client.close()
    logger.info("AI Agents API shutdown complete.")
