"use client";

import { Component, type ReactNode } from "react";
import { TabCard } from "@/components/ui/tab-card";

/**
 * U8: wraps one dashboard card so a rendering error inside it shows a small error card with "Retry"
 * instead of breaking the whole dashboard. (Failed requests are handled by the card itself through useResource.)
 */
export class CardBoundary extends Component<{ title: string; className?: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`Dashboard card "${this.props.title}" failed to render`, error);
  }

  render() {
    if (this.state.failed) {
      return <TabCard className={this.props.className} error="This card couldn't be shown." onRetry={() => this.setState({ failed: false })} title={this.props.title} />;
    }
    return this.props.children;
  }
}
