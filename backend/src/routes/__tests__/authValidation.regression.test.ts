import Fastify from "fastify";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { authRoutes } from "../auth.js";
import { addressRoutes } from "../addresses.js";
import { randomUUID } from "node:crypto";

describe("authentication and privacy request boundaries", () => {
  const app=Fastify();
  beforeAll(async()=>{
    await app.register(cookie);
    await app.register(jwt,{secret:"test-only-auth-regression-secret",cookie:{cookieName:"ops_session",signed:false}});
    await app.register(authRoutes,{prefix:"/auth"});
    await app.register(addressRoutes);
    await app.ready();
  });
  afterAll(async()=>{await app.close();});
  it.each([
    ["/auth/otp/request",{}],
    ["/auth/otp/request",{phone:"123",purpose:"LOGIN"}],
    ["/auth/otp/request",{phone:"abcdefghij",purpose:"LOGIN"}],
    ["/auth/otp/request",{phone:"9800000000",purpose:"RESET"}],
    ["/auth/otp/verify",{phone:"9800000000",otp_code:"123",purpose:"LOGIN"}],
    ["/auth/otp/verify",{phone:"abcdefghij",otp_code:"123456",purpose:"LOGIN"}],
    ["/auth/otp/verify",{phone:"9800000000",otp_code:"123456",purpose:"LOGIN",client:"OTHER"}],
    ["/auth/google",{credential:"short"}],
    ["/auth/google/link",{credential:"short",phone:"9800000000",otp_code:"123456"}],
    ["/auth/google/link",{credential:"x".repeat(100),phone:"abcdefghij",otp_code:"123456"}],
  ] as const)("rejects malformed authentication input at %s",async(url,payload)=>{
    const res=await app.inject({method:"POST",url,payload});
    expect(res.statusCode).toBe(400);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.json()).not.toHaveProperty("session_token");
  });
  it("rejects invalid staff JWT cookies on every auth administration endpoint",async()=>{
    for(const [method,url] of [["GET","/auth/admin/otp/stats"],["GET","/auth/admin/session/stats"],["POST","/auth/admin/otp/cleanup"],["POST","/auth/admin/session/cleanup"]] as const){
      for(const token of ["invalid",app.jwt.sign({sub:randomUUID()})]){
        const res=await app.inject({method,url,headers:{cookie:"ops_session="+token}});
        expect(res.statusCode).toBe(401);
      }
    }
  });
  it("denies unauthenticated reads and mutations of customer addresses",async()=>{
    const id=randomUUID();
    for(const [method,url] of [["GET","/addresses/"+id],["GET","/addresses/customer/"+id],["GET","/addresses/customer/"+id+"/default"],["POST","/addresses"],["PUT","/addresses/"+id],["DELETE","/addresses/"+id],["POST","/addresses/customer/"+id+"/default/"+id],["POST","/addresses/"+id+"/verify"]] as const){
      const res=await app.inject({method,url});
      expect(res.statusCode).toBe(401);
      expect(res.headers["cache-control"]).toBe("private, no-store");
    }
  });
});
