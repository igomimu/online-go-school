/**
 * 碁盤の外に置く小さな碁石（ニギリなど）。
 * 盤上の石（GoBoard）と同じく那智黒・蛤の質感に寄せる。
 */
export default function GoStone({ color, size = 24 }: { color: 'black' | 'white'; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: color === 'black'
          ? 'radial-gradient(circle at 33% 28%, #6b6862 0%, #23211c 45%, #0d0c0a 100%)'
          : 'radial-gradient(circle at 33% 28%, #ffffff 0%, #f0ece2 55%, #cdc7b8 100%)',
        boxShadow: color === 'black' ? '0 1px 2px rgba(0,0,0,.45)' : '0 1px 2px rgba(0,0,0,.3)',
      }}
    />
  );
}
