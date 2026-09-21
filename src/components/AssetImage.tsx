import { useEffect, useState } from 'react';
export function AssetImage({
  blob,
  ...props
}: { blob: Blob } & React.ImgHTMLAttributes<HTMLImageElement>) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url ? <img {...props} src={url} /> : null;
}
