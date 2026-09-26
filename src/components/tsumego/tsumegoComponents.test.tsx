import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TsumegoRatingBadge from './TsumegoRatingBadge';
import TsumegoRatingBar from './TsumegoRatingBar';
import TsumegoRankTransitionModal from './TsumegoRankTransitionModal';
import TsumegoInitialRankDialog from './TsumegoInitialRankDialog';
import { createInitialRatingState } from '../../utils/tsumegoRating';

describe('Tsumego Components', () => {
  describe('TsumegoRatingBadge', () => {
    it('renders badge for bronze_3', () => {
      render(<TsumegoRatingBadge rankId="bronze_3" />);
      expect(screen.getByTestId('tsumego-rating-badge')).toBeInTheDocument();
      expect(screen.getByText('ブロンズ棋士 Ⅲ')).toBeInTheDocument();
      expect(screen.getByText('🥉')).toBeInTheDocument();
    });

    it('renders points when showPoints is true', () => {
      const state = { ...createInitialRatingState('silver_2'), points: 3 };
      render(<TsumegoRatingBadge state={state} showPoints />);
      expect(screen.getByText('シルバー棋士 Ⅱ')).toBeInTheDocument();
      expect(screen.getByText('(3/5pt)')).toBeInTheDocument();
    });
  });

  describe('TsumegoRatingBar', () => {
    it('renders points bar, win streak, and protection', () => {
      const state = {
        ...createInitialRatingState('gold_1'),
        points: 4,
        consecutiveWins: 3,
        protectionCount: 1,
      };
      render(<TsumegoRatingBar state={state} />);
      expect(screen.getByTestId('tsumego-rating-bar')).toBeInTheDocument();
      expect(screen.getByText('ゴールド棋士 Ⅰ')).toBeInTheDocument();
      expect(screen.getByText('4/5 pt')).toBeInTheDocument();
      expect(screen.getByText('3連勝')).toBeInTheDocument();
      expect(screen.getByText('保護1')).toBeInTheDocument();
    });
  });

  describe('TsumegoRankTransitionModal', () => {
    it('renders promotion modal', () => {
      const onClose = vi.fn();
      render(
        <TsumegoRankTransitionModal
          event="promoted"
          previousRankId="bronze_1"
          newRankId="silver_4"
          onClose={onClose}
        />
      );
      expect(screen.getByTestId('tsumego-rank-transition-modal')).toBeInTheDocument();
      expect(screen.getByText('昇格おめでとう！')).toBeInTheDocument();
      expect(screen.getByText('シルバー棋士 Ⅳ')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '次の問題へ進む' }));
      expect(onClose).toHaveBeenCalled();
    });

    it('renders demotion modal', () => {
      const onClose = vi.fn();
      render(
        <TsumegoRankTransitionModal
          event="demoted"
          previousRankId="silver_4"
          newRankId="bronze_1"
          onClose={onClose}
        />
      );
      expect(screen.getByText('格付け変動')).toBeInTheDocument();
      expect(screen.getByText('ブロンズ棋士 Ⅰ')).toBeInTheDocument();
    });
  });

  describe('TsumegoInitialRankDialog', () => {
    it('allows selecting start tier and confirms', () => {
      const onSelect = vi.fn();
      render(<TsumegoInitialRankDialog onSelectInitialRank={onSelect} />);

      expect(screen.getByTestId('tsumego-initial-rank-dialog')).toBeInTheDocument();
      expect(screen.getByText('シルバー棋士 Ⅳ')).toBeInTheDocument();

      // シルバー棋士を選択
      fireEvent.click(screen.getByText('シルバー棋士 Ⅳ'));
      fireEvent.click(screen.getByText('この格からチャレンジを開始する'));

      expect(onSelect).toHaveBeenCalledWith('silver_4');
    });
  });
});
