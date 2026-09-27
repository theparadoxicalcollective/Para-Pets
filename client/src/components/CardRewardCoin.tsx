import coin from "@assets/icon_coin.png";
import "./CardRewardCoin.css";

interface CardRewardCoinProps {
  cardName: string;
  claimed: boolean;
  claiming: boolean;
  disabled: boolean;
  rewardAmount?: number;
  onClaim: () => void;
  onDismiss: () => void;
}

/** Anchored to the card's frame; the parent reserves space below the overlap. */
export default function CardRewardCoin({ cardName, claimed, claiming, disabled, rewardAmount, onClaim, onDismiss }: CardRewardCoinProps) {
  if (claimed && rewardAmount === undefined) return null;

  return <div className="card-reward-anchor">
    {rewardAmount !== undefined ? (
      <div role="status" aria-live="polite" className="card-reward-popup">
        <button type="button" aria-label={`Dismiss +${rewardAmount} coins reward`} onClick={event => {
          event.stopPropagation();
          onDismiss();
        }} className="card-reward-popup-button">
          +{rewardAmount} coins
        </button>
      </div>
    ) : (
      <button type="button" aria-label={claiming ? `Claiming reward for ${cardName}` : `Claim 100 coins for ${cardName}`}
        aria-busy={claiming} disabled={disabled} onClick={event => {
          event.stopPropagation();
          onClaim();
        }} className="card-reward-coin" data-testid="card-reward-coin">
        <img src={coin} alt="" draggable={false} />
      </button>
    )}
  </div>;
}
