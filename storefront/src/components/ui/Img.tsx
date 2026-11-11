import Image, { type ImageProps } from 'next/image';
import type { Img as ImgData } from '@/lib/types';

type Props = Omit<ImageProps, 'src' | 'alt' | 'width' | 'height' | 'placeholder' | 'blurDataURL'> & {
  image: ImgData | null | undefined;
  alt?: string;
  /** When true the image fills its positioned parent (object-fit cover). */
  fill?: boolean;
};

/** next/image with the blurred placeholder the API generates for every upload. */
export function Img({ image, alt, fill = true, className, quality = 75, ...rest }: Props) {
  if (!image) {
    return <div aria-hidden className={`bg-paper-2 ${fill ? 'absolute inset-0' : ''} ${className ?? ''}`} />;
  }
  const blur = image.placeholder ? { placeholder: 'blur' as const, blurDataURL: image.placeholder } : {};
  if (fill) {
    return <Image src={image.url} alt={alt ?? image.alt} fill quality={quality} className={className} {...blur} {...rest} />;
  }
  return (
    <Image
      src={image.url}
      alt={alt ?? image.alt}
      width={image.width ?? 1600}
      height={image.height ?? 1200}
      quality={quality}
      className={className}
      {...blur}
      {...rest}
    />
  );
}

/** For CMS fields that only carry a URL. */
export const urlImg = (url: string | null | undefined, alt = ''): ImgData | null =>
  url ? { url, width: null, height: null, alt, placeholder: null } : null;
