"""Azure AI Foundry provider.

Supports any model deployed to Azure AI Foundry via the Azure AI Inference SDK.
This includes:
  - Azure OpenAI models (GPT-4o, o1, etc.)
  - Meta Llama models
  - Mistral models
  - Phi models
  - Cohere models
  - Any serverless API endpoint in Azure AI Foundry

Setup:
  1. Go to https://ai.azure.com → Your Project → Deployments
  2. Copy the endpoint URL and API key for your deployment
  3. Set AZURE_AI_FOUNDRY_ENDPOINT, AZURE_AI_FOUNDRY_API_KEY, AZURE_AI_FOUNDRY_DEPLOYMENT

Embedding:
  - Set AZURE_AI_FOUNDRY_EMBED_DEPLOYMENT to an embedding model deployment
    (e.g., text-embedding-3-large deployed via Azure OpenAI)
  - Falls back to Gemini embeddings if not set
"""

from __future__ import annotations

import asyncio
from typing import Any

from agent.config import settings
from agent.providers.base import LLMResponse

# Azure text-embedding-3-large output dimensions
_EMBED_DIMENSIONS = 1536


class AzureAIFoundryProvider:
    """Azure AI Foundry provider using azure-ai-inference SDK.

    Works with any model hosted in Azure AI Foundry, including Azure OpenAI
    deployments, serverless Llama/Mistral/Phi endpoints, and managed compute.
    """

    def __init__(self, model: str | None = None) -> None:
        endpoint = settings.azure_ai_foundry_endpoint
        api_key = settings.azure_ai_foundry_api_key

        if not endpoint or not api_key:
            raise ValueError("AZURE_AI_FOUNDRY_ENDPOINT and AZURE_AI_FOUNDRY_API_KEY must be set")

        self._model = model or settings.azure_ai_foundry_deployment
        self._client: Any = None

        # Detect endpoint type:
        # - OpenAI-compatible endpoint (contains /openai/) → use openai SDK with AzureOpenAI
        # - Standard Azure OpenAI domain (*.openai.azure.com) → use AzureOpenAI
        # - Native azure-ai-inference endpoint → use ChatCompletionsClient
        if "/openai/v1/" in endpoint:
            # Azure AI Foundry project-scoped endpoint already contains /v1/ in the path.
            # Use plain openai.OpenAI with base_url — no api_version query param needed.
            from openai import OpenAI

            # Strip everything after /v1/ to get the stable base URL
            base = endpoint[: endpoint.index("/openai/v1/") + len("/openai/v1/")]
            self._client = OpenAI(
                base_url=base,
                api_key=api_key,
            )
            self._use_openai = True
        elif "/openai/" in endpoint or ".openai.azure.com" in endpoint:
            from openai import AzureOpenAI

            # Standard Azure OpenAI Service endpoint (*.openai.azure.com)
            # Extract base URL (up to and including the domain, before any path)
            if ".openai.azure.com" in endpoint:
                # Extract just the domain part: https://resource.openai.azure.com
                idx = endpoint.index(".openai.azure.com") + len(".openai.azure.com")
                base = endpoint[:idx]
                # Ensure it ends with /
                if not base.endswith("/"):
                    base += "/"
            else:
                # Has /openai/ in path, strip everything after /openai/
                base = endpoint[: endpoint.index("/openai/") + len("/openai/")]
            self._client = AzureOpenAI(
                azure_endpoint=base,
                api_key=api_key,
                api_version="2024-12-01-preview",
            )
            self._use_openai = True
        else:
            from azure.ai.inference import ChatCompletionsClient
            from azure.core.credentials import AzureKeyCredential

            self._client = ChatCompletionsClient(
                endpoint=endpoint,
                credential=AzureKeyCredential(api_key),
                api_version="2024-12-01-preview",
            )
            self._use_openai = False

    async def complete(
        self,
        prompt: str,
        system: str | None = None,
        max_tokens: int = 256,
        temperature: float = 0.3,
    ) -> LLMResponse:
        if self._use_openai:
            messages: list[dict[str, str]] = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({"role": "user", "content": prompt})

            response = await asyncio.to_thread(
                self._client.chat.completions.create,
                messages=messages,
                model=self._model,
                max_completion_tokens=max_tokens,
            )
            usage = response.usage
            return LLMResponse(
                content=response.choices[0].message.content or "",
                provider="azure_openai",
                model=response.model,
                input_tokens=usage.prompt_tokens if usage else 0,
                output_tokens=usage.completion_tokens if usage else 0,
            )

        from azure.ai.inference.models import (
            SystemMessage,
            UserMessage,
        )

        ai_messages: list[SystemMessage | UserMessage] = []
        if system:
            ai_messages.append(SystemMessage(content=system))
        ai_messages.append(UserMessage(content=prompt))

        response = await asyncio.to_thread(
            self._client.complete,
            messages=ai_messages,
            model=self._model,
            max_tokens=max_tokens,
            temperature=temperature,
        )

        text: str = response.choices[0].message.content or ""
        usage = response.usage
        return LLMResponse(
            content=text,
            input_tokens=getattr(usage, "prompt_tokens", 0),
            output_tokens=getattr(usage, "completion_tokens", 0),
            model=self._model,
            provider="azure-ai-foundry",
        )

    async def embed(self, text: str) -> list[float]:
        deploy = settings.azure_ai_foundry_embed_deployment
        if not deploy:
            # No embedding deployment configured — fall through to next provider
            raise NotImplementedError("No AZURE_AI_FOUNDRY_EMBED_DEPLOYMENT set")

        # Use a dedicated embed endpoint when provided (Azure AI Services multi-service
        # resource endpoints differ from project-scoped Foundry endpoints).
        embed_endpoint = settings.azure_ai_foundry_embed_endpoint or settings.azure_ai_foundry_endpoint
        api_key = settings.azure_ai_foundry_api_key

        # Azure AI Services endpoint (*.services.ai.azure.com) uses the new /openai/v1/ path.
        # Project-scoped endpoints already contain /openai/v1/ in the URL.
        # Classic *.openai.azure.com uses AzureOpenAI with api_version.
        if "/openai/v1/" in embed_endpoint or "services.ai.azure.com" in embed_endpoint:
            # Both project-scoped (/openai/v1/) and multi-service (*.services.ai.azure.com)
            # use the OpenAI client with base_url pointing at the /openai/v1/ root.
            from openai import OpenAI

            if "/openai/v1/" in embed_endpoint:
                base = embed_endpoint[: embed_endpoint.index("/openai/v1/") + len("/openai/v1/")]
            else:
                # *.services.ai.azure.com — append /openai/v1/
                base = embed_endpoint.rstrip("/") + "/openai/v1/"

            _embed_client: OpenAI = OpenAI(base_url=base, api_key=api_key)

            response = await asyncio.to_thread(
                _embed_client.embeddings.create,
                input=[text[:8000]],
                model=deploy,
            )
            data = response.data[0].embedding
        elif ".openai.azure.com" in embed_endpoint:
            # Classic Azure OpenAI Service — use AzureOpenAI client
            from openai import AzureOpenAI

            idx = embed_endpoint.index(".openai.azure.com") + len(".openai.azure.com")
            base = embed_endpoint[:idx].rstrip("/") + "/"
            _aoai_client = AzureOpenAI(
                azure_endpoint=base, api_key=api_key, api_version="2024-12-01-preview"
            )
            response = await asyncio.to_thread(
                _aoai_client.embeddings.create,
                input=[text[:8000]],
                model=deploy,
            )
            data = response.data[0].embedding
        else:
            # Fallback: Azure AI Inference EmbeddingsClient
            from azure.ai.inference import EmbeddingsClient
            from azure.core.credentials import AzureKeyCredential

            client = EmbeddingsClient(
                endpoint=embed_endpoint,
                credential=AzureKeyCredential(api_key),
            )
            response = await asyncio.to_thread(
                client.embed,
                input=[text[:8000]],
                model=deploy,
            )
            data = response.data[0].embedding

        embedding: list[float] = data if isinstance(data, list) else []
        # Pad/truncate to 1536 to match DB vector(1536) column
        if len(embedding) < _EMBED_DIMENSIONS:
            embedding = embedding + [0.0] * (_EMBED_DIMENSIONS - len(embedding))
        return embedding[:_EMBED_DIMENSIONS]

    async def embed_image(self, image_bytes: bytes, mime_type: str) -> list[float]:
        """Attempt to call an Azure Foundry image embedding deployment.

        The Azure Embeddings service may accept image content as a base64
        payload depending on deployment — this method tries a conservative
        call and raises NotImplementedError when no image deployment is set.
        """
        deploy = settings.azure_image_embed_deployment
        if not deploy:
            raise NotImplementedError("No AZURE_IMAGE_EMBED_DEPLOYMENT set")

        embed_endpoint = settings.azure_image_embed_endpoint or settings.azure_ai_foundry_endpoint
        api_key = settings.azure_ai_foundry_api_key

        # Try Azure AI Inference EmbeddingsClient with base64 image payload
        try:
            from azure.ai.inference import EmbeddingsClient
            from azure.core.credentials import AzureKeyCredential
            import base64

            client = EmbeddingsClient(endpoint=embed_endpoint, credential=AzureKeyCredential(api_key))
            b64 = base64.b64encode(image_bytes).decode()

            response = await asyncio.to_thread(
                client.embed,
                input=[{"mime_type": mime_type, "content": b64}],
                model=deploy,
            )
            data = response.data[0].embedding
            embedding: list[float] = data if isinstance(data, list) else []
            if len(embedding) < _EMBED_DIMENSIONS:
                embedding = embedding + [0.0] * (_EMBED_DIMENSIONS - len(embedding))
            return embedding[:_EMBED_DIMENSIONS]
        except Exception as exc:  # pragma: no cover - best-effort network call
            raise
