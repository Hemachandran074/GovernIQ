import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import App from './App';

describe('App Shell', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the header title and subtitle', () => {
    render(<App />);
    expect(screen.getByText('Governance Graph Builder')).toBeInTheDocument();
    expect(
      screen.getByText(/Agents, models, tools, users, data sources & policies/i)
    ).toBeInTheDocument();
  });

  it('renders the sidebar legend items', () => {
    render(<App />);
    expect(screen.getByText('Legend')).toBeInTheDocument();
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('Model')).toBeInTheDocument();
    expect(screen.getByText('Tool')).toBeInTheDocument();
    expect(screen.getByText('Data Source')).toBeInTheDocument();
    expect(screen.getByText('Policy')).toBeInTheDocument();
  });

  it('renders graph node and edge counters initialized to 0', () => {
    render(<App />);
    expect(screen.getByText(/0 nodes/i)).toBeInTheDocument();
    expect(screen.getByText(/0 edges/i)).toBeInTheDocument();
  });
});
