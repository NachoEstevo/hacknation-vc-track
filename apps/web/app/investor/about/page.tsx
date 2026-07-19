import type { Metadata } from "next";
import Image from "next/image";
import { ArrowUpRight, Linkedin } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "About",
  description: "undr is a HackNation hackathon project.",
};

const TEAM = [
  {
    name: "Juan Ignacio Bedoian",
    photo: "/team/juan-ignacio-bedoian.png",
    linkedin: "https://www.linkedin.com/in/juan-ignacio-bedoian/",
  },
  {
    name: "Mauro Proto Cassina",
    photo: "/team/mauro-proto-cassina.png",
    linkedin: "https://www.linkedin.com/in/mauroprotocassina/",
  },
  {
    name: "Ignacio Estevo",
    photo: "/team/ignacio-estevo.png",
    linkedin: "https://www.linkedin.com/in/ignacio-estevo/",
  },
] as const;

export default function AboutPage() {
  return (
    <AppShell eyebrow="The project" title="About undr">
      <div className={styles.page}>
        <section className={styles.intro}>
          <p>
            undr is a hackathon project built for{" "}
            <a href="https://hack-nation.ai/" target="_blank" rel="noreferrer noopener">
              HackNation
              <ArrowUpRight aria-hidden="true" />
            </a>
            {" "}— an evidence-first sourcing workspace where an agent researches real
            founders from undr&rsquo;s curated base and the live web, and backs every
            candidate card with sources an investor can check.
          </p>
        </section>

        <section aria-labelledby="team-heading" className={styles.teamSection}>
          <h2 id="team-heading" className={styles.teamHeading}>The team</h2>
          <div className={styles.teamGrid}>
            {TEAM.map((member) => (
              <a
                key={member.name}
                href={member.linkedin}
                target="_blank"
                rel="noreferrer noopener"
                className={styles.memberCard}
                aria-label={`${member.name} on LinkedIn`}
              >
                <span className={styles.photoWrap}>
                  <Image
                    src={member.photo}
                    alt={`Portrait of ${member.name}`}
                    width={640}
                    height={640}
                    className={styles.photo}
                  />
                </span>
                <span className={styles.memberName}>{member.name}</span>
                <span className={styles.memberLink}>
                  <Linkedin aria-hidden="true" />
                  LinkedIn
                  <ArrowUpRight aria-hidden="true" />
                </span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
