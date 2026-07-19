export interface RelyDemoProfile {
  company: {
    name: "Rely";
    domain: "rely.business";
    launchedAt: "2026-04";
    websiteUrl: string;
    instagramUrl: string;
    revenueModel: "one_time_payments";
    uniquePayingCustomers: { value: 55; verificationState: "founder_stated" };
    mrr: null;
    githubOrganization: {
      url: string;
      visibility: "private";
      verificationState: "founder_stated";
    };
  };
  founders: Array<{
    name: string;
    role: string;
    occupation: string;
    linkedInUrl: string;
    githubUrl: string;
    otherCompanies: string[];
    relationshipState: "founder_confirmed";
  }>;
}

export function buildRelyDemoProfile(): RelyDemoProfile {
  return {
    company: {
      name: "Rely",
      domain: "rely.business",
      launchedAt: "2026-04",
      websiteUrl: "https://rely.business",
      instagramUrl: "https://www.instagram.com/use.rely/",
      revenueModel: "one_time_payments",
      uniquePayingCustomers: { value: 55, verificationState: "founder_stated" },
      mrr: null,
      githubOrganization: {
        url: "https://github.com/relycompany",
        visibility: "private",
        verificationState: "founder_stated",
      },
    },
    founders: [
      {
        name: "Ignacio Estevo",
        role: "Co-founder and CTO",
        occupation: "Software Engineer",
        linkedInUrl: "https://www.linkedin.com/in/ignacio-estevo/",
        githubUrl: "https://github.com/NachoEstevo",
        otherCompanies: ["Acelera Agency"],
        relationshipState: "founder_confirmed",
      },
      {
        name: "Franco Ferreira",
        role: "Co-founder and CEO",
        occupation: "Founder and product-minded full-stack engineer",
        linkedInUrl: "https://www.linkedin.com/in/franco-ferreira",
        githubUrl: "https://github.com/frxnnk",
        otherCompanies: ["Acelera Agency"],
        relationshipState: "founder_confirmed",
      },
    ],
  };
}
