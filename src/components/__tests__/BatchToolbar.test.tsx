import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BatchToolbar from '../BatchToolbar';
import type { Group } from '../../types';

const mockGroups: Group[] = [
  { id: 'g1', name: '工作', isDefault: false, createdAt: 1000 },
  { id: 'g2', name: '个人', isDefault: false, createdAt: 2000 },
  { id: 'g3', name: '默认分组', isDefault: true, createdAt: 0 },
];

const defaultProps = {
  selectedCount: 3,
  groups: mockGroups,
  onMove: vi.fn(),
  onClearSelection: vi.fn(),
};

describe('BatchToolbar', () => {
  it('显示已选账户数量', () => {
    render(<BatchToolbar {...defaultProps} selectedCount={5} />);
    expect(screen.getByText(/已选择 5 个账户/)).toBeInTheDocument();
  });

  it('渲染目标分组下拉框，包含所有分组选项', () => {
    render(<BatchToolbar {...defaultProps} />);
    const select = screen.getByLabelText('选择目标分组') as HTMLSelectElement;
    expect(select).toBeInTheDocument();

    // 验证所有分组都作为选项存在
    for (const group of mockGroups) {
      expect(screen.getByRole('option', { name: group.name })).toBeInTheDocument();
    }
  });

  it('渲染"批量移动"按钮', () => {
    render(<BatchToolbar {...defaultProps} />);
    expect(screen.getByRole('button', { name: '批量移动' })).toBeInTheDocument();
  });

  it('渲染"取消选择"按钮', () => {
    render(<BatchToolbar {...defaultProps} />);
    expect(screen.getByRole('button', { name: '取消选择' })).toBeInTheDocument();
  });

  it('未选择目标分组时"批量移动"按钮禁用', () => {
    render(<BatchToolbar {...defaultProps} />);
    expect(screen.getByRole('button', { name: '批量移动' })).toBeDisabled();
  });

  it('选择目标分组后"批量移动"按钮启用', () => {
    render(<BatchToolbar {...defaultProps} />);

    const select = screen.getByLabelText('选择目标分组');
    fireEvent.change(select, { target: { value: 'g1' } });

    expect(screen.getByRole('button', { name: '批量移动' })).toBeEnabled();
  });

  it('点击"取消选择"调用 onClearSelection', () => {
    const onClearSelection = vi.fn();
    render(<BatchToolbar {...defaultProps} onClearSelection={onClearSelection} />);

    fireEvent.click(screen.getByRole('button', { name: '取消选择' }));
    expect(onClearSelection).toHaveBeenCalledOnce();
  });
});
