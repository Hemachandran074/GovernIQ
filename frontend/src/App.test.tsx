import { render, screen, fireEvent } from '@testing-library/react';
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

  it('smoothly toggles sidebar collapsed and expanded states', () => {
    render(<App />);
    const sidebar = screen.getByTestId('sidebar');
    expect(sidebar).toHaveClass('w-[346px]');

    // Click collapse button
    const collapseBtn = screen.getByTitle('Collapse sidebar');
    fireEvent.click(collapseBtn);
    expect(sidebar).toHaveClass('w-0');
    expect(sidebar).toHaveClass('opacity-0');

    // Click expand button
    const expandBtn = screen.getByTitle('Expand sidebar');
    fireEvent.click(expandBtn);
    expect(sidebar).toHaveClass('w-[346px]');
    expect(sidebar).toHaveClass('opacity-100');
  });

  it('toggles theme between light and dark', () => {
    render(<App />);
    const themeBtn = screen.getByTitle('Toggle Theme');
    fireEvent.click(themeBtn);
    expect(document.documentElement.getAttribute('data-theme')).toMatch(/light|dark/);
  });
});
