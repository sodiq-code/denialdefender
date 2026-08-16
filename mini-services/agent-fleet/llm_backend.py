"""
DenialDefender Gemini-Only LLM System
Backend: Google Gemini 3.5+ (direct API)

Architecture:
- Uses Gemini direct API as the sole LLM backend
- No fallback — if Gemini fails, returns error LLMResponse
- Maintains consistent interface for all 8 agents
"""

import os
import json
import logging
from typing import Optional
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class LLMBackend(Enum):
    GEMINI_DIRECT = "gemini_direct"

@dataclass
class LLMResponse:
    content: str
    model: str
    backend: LLMBackend
    tokens_used: int = 0
    success: bool = True
    error: Optional[str] = None

class GeminiLLM:
    """
    Gemini-only LLM client using Google Gemini 3.5+ direct API.
    No fallback backend — if Gemini fails, returns error LLMResponse.
    """
    
    def __init__(self):
        self.gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
        self.gemini_model = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")
        self.active_backend: LLMBackend = LLMBackend.GEMINI_DIRECT
        self.gemini_available: Optional[bool] = None
        self._check_gemini()
    
    def _check_gemini(self) -> None:
        """Check if Gemini API is accessible."""
        if not self.gemini_api_key:
            self.gemini_available = False
            logger.info("No GEMINI_API_KEY set — agents will use mock mode")
            return
        
        try:
            import urllib.request
            url = f"https://generativelanguage.googleapis.com/v1beta/models?key={self.gemini_api_key}"
            req = urllib.request.Request(url)
            response = urllib.request.urlopen(req, timeout=5)
            self.gemini_available = True
        except Exception as e:
            error_msg = str(e)
            if "location is not supported" in error_msg:
                logger.warning("Gemini API geo-blocked in this region")
            elif "leaked" in error_msg:
                logger.warning("Gemini API key reported as leaked")
            elif "PERMISSION_DENIED" in error_msg:
                logger.warning("Gemini API permission denied")
            else:
                logger.warning(f"Gemini API check failed: {error_msg[:100]}")
            self.gemini_available = False
        
        if self.gemini_available:
            logger.info(f"Active LLM backend: {self.active_backend.value}")
        else:
            logger.warning("Gemini API not available — agents will use mock mode")
    
    def generate(self, prompt: str, system_prompt: str = "", 
                 model: Optional[str] = None, temperature: float = 0.7,
                 max_tokens: int = 2048) -> LLMResponse:
        """Generate text using Gemini direct API. No fallback."""
        return self._generate_gemini(prompt, system_prompt, model, temperature, max_tokens)
    
    def _generate_gemini(self, prompt: str, system_prompt: str,
                         model: Optional[str], temperature: float,
                         max_tokens: int) -> LLMResponse:
        """Generate using Gemini API directly."""
        try:
            import urllib.request
            model_name = model or self.gemini_model
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={self.gemini_api_key}"
            
            contents = []
            if system_prompt:
                contents.append({"role": "user", "parts": [{"text": system_prompt}]})
                contents.append({"role": "model", "parts": [{"text": "Understood."}]})
            contents.append({"role": "user", "parts": [{"text": prompt}]})
            
            body = json.dumps({
                "contents": contents,
                "generationConfig": {
                    "temperature": temperature,
                    "maxOutputTokens": max_tokens
                }
            }).encode()
            
            req = urllib.request.Request(url, data=body, method='POST')
            req.add_header('Content-Type', 'application/json')
            response = urllib.request.urlopen(req, timeout=60)
            data = json.loads(response.read().decode())
            
            text = data['candidates'][0]['content']['parts'][0]['text']
            tokens = data.get('usageMetadata', {}).get('totalTokenCount', 0)
            
            return LLMResponse(
                content=text,
                model=model_name,
                backend=LLMBackend.GEMINI_DIRECT,
                tokens_used=tokens,
                success=True
            )
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Gemini API error: {error_msg[:200]}")
            return LLMResponse(
                content="",
                model=model or self.gemini_model,
                backend=LLMBackend.GEMINI_DIRECT,
                success=False,
                error=error_msg
            )

# Singleton instance
_llm_instance: Optional[GeminiLLM] = None

def get_llm() -> GeminiLLM:
    """Get the singleton LLM instance."""
    global _llm_instance
    if _llm_instance is None:
        _llm_instance = GeminiLLM()
    return _llm_instance
