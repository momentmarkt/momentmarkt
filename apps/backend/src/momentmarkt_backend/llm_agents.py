from __future__ import annotations

import json
import os
from typing import Any, Literal

from pydantic import BaseModel, Field


def default_use_llm() -> bool:
    """Process-wide default for the ``use_llm`` flag (issue #163).

    Per the "no fake mock data, use the LLM" directive, the LLM path is
    the chosen-by-default behaviour for every demo surface — fixtures
    stay around as fallback-on-failure only.

    Teammates running deterministic locally (no Azure key, no network,
    or just wanting reproducible output) can flip the default off with
    ``MOMENTMARKT_USE_LLM=false`` in the environment. Accepted falsey
    values (case-insensitive): ``"0"``, ``"false"``, ``"no"``, ``"off"``.
    Anything else (including unset) keeps the default at True.
    """
    raw = os.environ.get("MOMENTMARKT_USE_LLM")
    if raw is None:
        return True
    return raw.strip().lower() not in {"0", "false", "no", "off"}


class ValidWindow(BaseModel):
    start: str
    end: str


class CopySeed(BaseModel):
    headline_de: str
    headline_en: str
    body_de: str
    body_en: str


class OfferDraft(BaseModel):
    discount_type: Literal["percent", "fixed", "item"]
    discount_value: int | float | str
    valid_window: ValidWindow
    copy_seed: CopySeed
    mood_image_key: str
    cta: str


class OpportunityDraftOutput(BaseModel):
    offer: OfferDraft
    widget_spec: dict[str, Any] = Field(description="React Native GenUI primitive tree")


class HeadlineRewriteOutput(BaseModel):
    headline_final: str = Field(description="Final short in-app card headline")


async def run_opportunity_agent(context: dict[str, Any]) -> dict[str, Any]:
    model = _model_name()
    instructions = (
        "You are the MomentMarkt Opportunity Agent. Draft one merchant offer "
        "and one React Native GenUI widget spec. Return only the structured "
        "output. The widget tree may only use View, ScrollView, Text, Image, "
        "and Pressable. Pressable must use action='redeem'. Do not use high "
        "intent signals; Surfacing owns per-user behavior. Write the English "
        "copy first as the source of truth (headline_en, body_en, and the "
        "widget text); then translate to German for headline_de and body_de. "
        "All visible widget Text nodes (incl. the redeem button) must be in "
        "English.\n"
        "\n"
        "WIDGET SCHEMA (strict — every node must conform or the spec is rejected):\n"
        "- Root: { type: 'View'|'ScrollView', className?: string, children: WidgetNode[] }\n"
        "- View / ScrollView: { type, className?: string, children: WidgetNode[] }\n"
        "- Text: { type: 'Text', className?: string, text: string }\n"
        "- Image: { type: 'Image', className?: string, source: string, accessibilityLabel: string }\n"
        "- Pressable: { type: 'Pressable', className?: string, action: 'redeem', text: string }\n"
        "- children: ALWAYS a list of valid nodes, never null, never undefined, never an object.\n"
        "- Image.accessibilityLabel is REQUIRED on every Image node (short human description).\n"
        "- Pressable.action MUST be the literal lowercase string 'redeem' (case-sensitive). "
        "Never 'Redeem', 'submit', 'buy', or any other value.\n"
        "- No extra fields beyond those listed. Max nesting depth: 12 levels.\n"
        "\n"
        "MERCHANT GROUNDING:\n"
        "- If `merchant_enrichment` is present in the signal_context, treat its "
        "`signature_items`, `vibe_descriptors`, `hours_typical`, and "
        "`top_review_quotes` as ground truth. Ground both German + English "
        "headline_de/headline_en and body_de/body_en (and the visible widget "
        "Text nodes) in those real signature items and vibe descriptors. Pick "
        "ONE specific signature item to anchor the body copy when it fits.\n"
        "- Never invent a menu item, hour, price, or quote that isn't in the "
        "enrichment. If the enrichment is silent on a detail, leave it out.\n"
        "- If `merchant_enrichment` is absent, fall back to category-level copy "
        "as before — do not invent specifics."
    )
    prompt = {
        "task": "Draft one Opportunity Agent output for a merchant inbox.",
        "required_contract": "{ offer, widget_spec }",
        "signal_context": context,
        "copy_rules": [
            "Write English copy first (headline_en, body_en, widget text); German is a translation of the English source.",
            "Use the fired weather/event/demand signals.",
            "Keep card copy short enough for a phone.",
            "Use neutral product UI language and no Sparkassen branding.",
            "Keep discount inside the merchant budget.",
            "All visible widget Text nodes (incl. the redeem button) must be in English.",
        ],
    }
    output = await _run_structured_agent(
        model=model,
        output_type=OpportunityDraftOutput,
        instructions=instructions,
        prompt=prompt,
    )
    return output.model_dump(mode="json")


async def run_headline_rewrite_agent(
    offer: dict[str, Any],
    wrapped_user_context: dict[str, Any],
    aggressive: bool,
) -> str:
    model = _model_name()
    instructions = (
        "You are the MomentMarkt Surfacing Agent headline rewriter. Rewrite "
        "only the final in-app card headline for the already-approved offer. "
        "Do not change discount, widget layout, or offer body. Keep it short. "
        "Write the rewritten headline in English."
    )
    prompt = {
        "task": "Rewrite one English headline for the current wrapped user context.",
        "offer_copy_seed": offer["copy_seed"],
        "wrapped_user_context": wrapped_user_context,
        "language": "English",
        "style": "more direct and conversion-oriented" if aggressive else "gentle and contextual",
    }
    output = await _run_structured_agent(
        model=model,
        output_type=HeadlineRewriteOutput,
        instructions=instructions,
        prompt=prompt,
    )
    return output.headline_final


async def _run_structured_agent(
    model: Any,
    output_type: type[BaseModel],
    instructions: str,
    prompt: dict[str, Any],
) -> BaseModel:
    from pydantic_ai import Agent

    agent = Agent(model, output_type=output_type, instructions=instructions)
    result = await agent.run(json.dumps(prompt, ensure_ascii=True))
    return result.output


def _model_name() -> Any:
    """Build a pydantic-ai model from env config.

    Dispatches on MOMENTMARKT_LLM_PROVIDER (explicit), or auto-detects when
    unset:
      azure       → OpenAIChatModel + AzureProvider (AZURE_OPENAI_ENDPOINT/API_KEY).
      openrouter  → OpenAIChatModel + OpenAIProvider with OpenRouter base_url.
      openai      → OpenAIChatModel + OpenAIProvider (OPENAI_API_KEY).
      (unset)     → auto-detect: AZURE_* present → azure;
                    else OPENAI_API_KEY present → openai;
                    else string form like "openai:gpt-5.2" passed to Agent.

    MOMENTMARKT_LLM_MODEL: required for Azure (= deployment name) and OpenRouter;
    optional for OpenAI (defaults to gpt-4o-mini).
    """
    provider = os.environ.get("MOMENTMARKT_LLM_PROVIDER", "").strip().lower()
    model_name = os.environ.get("MOMENTMARKT_LLM_MODEL") or os.environ.get(
        "MOMENTMARKT_PYDANTIC_AI_MODEL"
    )

    if not provider:
        if os.environ.get("AZURE_OPENAI_API_KEY") and os.environ.get("AZURE_OPENAI_ENDPOINT"):
            provider = "azure"
        elif os.environ.get("OPENAI_API_KEY"):
            provider = "openai"

    if provider == "openai" and not model_name:
        model_name = "gpt-4o-mini"

    if not model_name:
        raise RuntimeError("MOMENTMARKT_LLM_MODEL is not set")

    if provider == "openai":
        from pydantic_ai.models.openai import OpenAIChatModel
        from pydantic_ai.providers.openai import OpenAIProvider

        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError(
                "MOMENTMARKT_LLM_PROVIDER=openai requires OPENAI_API_KEY"
            )
        return OpenAIChatModel(model_name, provider=OpenAIProvider(api_key=api_key))

    if provider == "azure":
        from pydantic_ai.models.openai import OpenAIChatModel
        from pydantic_ai.providers.azure import AzureProvider

        endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
        api_key = os.environ.get("AZURE_OPENAI_API_KEY")
        if not endpoint or not api_key:
            raise RuntimeError(
                "MOMENTMARKT_LLM_PROVIDER=azure requires AZURE_OPENAI_ENDPOINT "
                "and AZURE_OPENAI_API_KEY"
            )
        return OpenAIChatModel(
            model_name,
            provider=AzureProvider(azure_endpoint=endpoint, api_key=api_key),
        )

    if provider == "openrouter":
        from pydantic_ai.models.openai import OpenAIChatModel
        from pydantic_ai.providers.openai import OpenAIProvider

        api_key = os.environ.get("OPENROUTER_API_KEY")
        if not api_key:
            raise RuntimeError(
                "MOMENTMARKT_LLM_PROVIDER=openrouter requires OPENROUTER_API_KEY"
            )
        return OpenAIChatModel(
            model_name,
            provider=OpenAIProvider(
                api_key=api_key,
                base_url="https://openrouter.ai/api/v1",
            ),
        )

    if ":" not in model_name:
        raise RuntimeError(
            "When MOMENTMARKT_LLM_PROVIDER is unset, MOMENTMARKT_LLM_MODEL must "
            "include a provider prefix, e.g. openai:gpt-5.2"
        )
    return model_name
