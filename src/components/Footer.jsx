import {
  // IconBrandDiscord,
  IconBrandGithub,
  IconBrandGmail,
  // IconBrandInstagram,
  IconBrandLinkedin,
  // IconBrandStackoverflow,
  // IconBrandTelegram,
  // IconBrandWhatsapp,
  // IconPhoneCall,
} from '@tabler/icons-react';

export default function Footer() {
  return (
    <footer className="footer footer-center px-10 bg-base-200 text-base-content rounded flex justify-between mt-auto">
      <div className="label text-xl flex">
        Developed by{' '}
        <span
          className="text-accent link p-0 m-0"
          onClick={() => {
            window.open('https://krishnaraj.vercel.app/', '_blank');
          }}
        >
          Krishnaraj T
        </span>{' '}
        for Keeping track of work done. Feel free to contribute, or use for yourself :)
      </div>
      <div className="flex flex-wrap gap-4 m-4 justify-center items-center">
        <button
          className="btn btn-neutral btn-circle btn-md"
          onClick={() => {
            window.open('mailto:kpt.krishnaraj@gmail.com', '_blank');
          }}
        >
          <IconBrandGmail stroke={1} className="w-8 h-8" />
        </button>
        <button
          className="btn btn-neutral btn-circle btn-md"
          onClick={() => {
            window.open('https://www.github.com/KrishnarajT', '_blank');
            navigator.clipboard.writeText('https://www.github.com/KrishnarajT');
          }}
        >
          <IconBrandGithub stroke={1} className="w-8 h-8" />
        </button>
        <button
          className="btn btn-neutral btn-circle btn-md"
          onClick={() => {
            window.open('https://www.linkedin.com/in/krishkpt', '_blank');
          }}
        >
          <IconBrandLinkedin stroke={1} className="w-8 h-8" />
        </button>
      </div>
    </footer>
  );
}
